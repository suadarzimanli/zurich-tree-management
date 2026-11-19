using Microsoft.EntityFrameworkCore;
using ZurichTreeManagement.Web.Data;
using ZurichTreeManagement.Web.Data.Entities;
using ZurichTreeManagement.Web.Models;

namespace ZurichTreeManagement.Web.Services;

public sealed class ActivityService
{
    private readonly ZurichDbContext _db;
    private readonly ILogger<ActivityService> _logger;

    public ActivityService(ZurichDbContext db, ILogger<ActivityService> logger)
    {
        _db = db;
        _logger = logger;
    }

    public async Task OnSrCreatedAsync(TmzServiceRequest sr, CancellationToken cancellationToken = default)
    {
        var now = DateTime.UtcNow;
        var plan = await FindPlanForSubAreaAsync(sr.SubArea, cancellationToken);
        if (plan is null)
        {
            await LogSystemAsync(sr.SrNumber, "ReportReceived", "Service request opened",
                $"SR {sr.SrNumber} created from {sr.Source}.", sr.CreatedBy, now, cancellationToken);
            await _db.SaveChangesAsync(cancellationToken);
            return;
        }

        var srPlan = new TmzSrActivityPlan
        {
            SrNumber = sr.SrNumber,
            PlanId = plan.PlanId,
            CurrentStepOrder = 1,
            Status = "Active",
            StartedAtUtc = now
        };
        _db.SrActivityPlans.Add(srPlan);

        await LogSystemAsync(sr.SrNumber, "ReportReceived", "Citizen report received",
            $"Request type: {sr.RequestType}. Priority: {sr.Priority}.", sr.CreatedBy, now, cancellationToken);

        await SpawnStepActivityAsync(sr, plan, stepOrder: 1, now, cancellationToken);
        await _db.SaveChangesAsync(cancellationToken);
    }

    public async Task OnInspectionClosedAsync(
        long srNumber,
        string inspectionStatus,
        CancellationToken cancellationToken = default)
    {
        var now = DateTime.UtcNow;
        var status = inspectionStatus.Trim();

        if (string.Equals(status, "No Work", StringComparison.OrdinalIgnoreCase))
        {
            await CompleteOpenPlanActivitiesAsync(srNumber, now, cancellationToken);
            await CompleteSrPlanAsync(srNumber, now, cancellationToken);
            await LogSystemAsync(srNumber, "StatusChange", "Inspection closed — no work required",
                "SR closed after inspection with no field work needed.", "System", now, cancellationToken);
            await _db.SaveChangesAsync(cancellationToken);
            return;
        }

        if (string.Equals(status, "Resolution", StringComparison.OrdinalIgnoreCase))
        {
            await CompleteActivitiesByTypeAsync(srNumber, ["SiteVisit", "Triage"], now, cancellationToken);
            await LogSystemAsync(srNumber, "Inspection", "Field inspection completed",
                "Inspection resolved — work order created.", "System", now, cancellationToken);
            await AdvancePlanAsync(srNumber, targetStepOrder: 3, now, cancellationToken);
            await _db.SaveChangesAsync(cancellationToken);
        }
    }

    public async Task OnWorkOrderResolvedAsync(long srNumber, CancellationToken cancellationToken = default)
    {
        var now = DateTime.UtcNow;
        await CompleteActivitiesByTypeAsync(srNumber, ["WorkOrderScheduled", "SiteVisit"], now, cancellationToken);
        await LogSystemAsync(srNumber, "WorkCompleted", "Work order resolved",
            "Field work completed — SR closed.", "System", now, cancellationToken);
        await AdvancePlanAsync(srNumber, targetStepOrder: 4, now, cancellationToken);
        await CompleteOpenPlanActivitiesAsync(srNumber, now, cancellationToken);
        await CompleteSrPlanAsync(srNumber, now, cancellationToken);
        await _db.SaveChangesAsync(cancellationToken);
    }

    public async Task OnSrStatusChangedAsync(
        long srNumber,
        string? previousStatus,
        string newStatus,
        string? changedBy,
        CancellationToken cancellationToken = default)
    {
        if (string.Equals(previousStatus, newStatus, StringComparison.OrdinalIgnoreCase))
            return;

        var now = DateTime.UtcNow;
        await LogSystemAsync(srNumber, "StatusChange", $"SR status → {newStatus}",
            previousStatus is null ? null : $"Previous status: {previousStatus}.", changedBy ?? "System", now, cancellationToken);
        await _db.SaveChangesAsync(cancellationToken);
    }

    public async Task EnsurePlanForSrAsync(long srNumber, CancellationToken cancellationToken = default)
    {
        var exists = await _db.SrActivityPlans.AnyAsync(p => p.SrNumber == srNumber, cancellationToken);
        if (exists) return;

        var sr = await _db.ServiceRequests.AsNoTracking()
            .FirstOrDefaultAsync(s => s.SrNumber == srNumber, cancellationToken);
        if (sr is null) return;

        var tracked = await _db.ServiceRequests.FirstAsync(s => s.SrNumber == srNumber, cancellationToken);
        await OnSrCreatedAsync(tracked, cancellationToken);
    }

    public async Task<IReadOnlyList<ActivityDto>> GetActivitiesAsync(
        long srNumber,
        CancellationToken cancellationToken = default)
    {
        await EnsurePlanForSrAsync(srNumber, cancellationToken);

        var rows = await _db.Activities
            .AsNoTracking()
            .Include(a => a.PlanStep)
            .Where(a => a.SrNumber == srNumber)
            .OrderByDescending(a => a.CreatedAtUtc)
            .ToListAsync(cancellationToken);

        return rows.Select(MapActivity).ToList();
    }

    public async Task<ActivityPlanProgressDto?> GetPlanProgressAsync(
        long srNumber,
        CancellationToken cancellationToken = default)
    {
        await EnsurePlanForSrAsync(srNumber, cancellationToken);

        var srPlan = await _db.SrActivityPlans
            .AsNoTracking()
            .Include(p => p.Plan)
            .ThenInclude(p => p.Steps)
            .FirstOrDefaultAsync(p => p.SrNumber == srNumber, cancellationToken);

        if (srPlan is null) return null;

        var steps = srPlan.Plan.Steps
            .OrderBy(s => s.StepOrder)
            .Select(s => new ActivityPlanStepDto
            {
                StepId = s.StepId,
                StepOrder = s.StepOrder,
                Name = s.Name,
                ActivityType = s.ActivityType,
                Description = s.Description,
                IsCurrent = s.StepOrder == srPlan.CurrentStepOrder && srPlan.Status == "Active",
                IsCompleted = s.StepOrder < srPlan.CurrentStepOrder || srPlan.Status == "Completed"
            })
            .ToList();

        return new ActivityPlanProgressDto
        {
            SrNumber = srNumber,
            PlanName = srPlan.Plan.Name,
            SubArea = srPlan.Plan.SubArea,
            CurrentStepOrder = srPlan.CurrentStepOrder,
            Status = srPlan.Status,
            Steps = steps
        };
    }

    public async Task<(bool Success, string? Error, ActivityDto? Activity)> CreateManualActivityAsync(
        long srNumber,
        CreateActivityRequest request,
        string? createdBy,
        CancellationToken cancellationToken = default)
    {
        var sr = await _db.ServiceRequests.AnyAsync(s => s.SrNumber == srNumber, cancellationToken);
        if (!sr)
            return (false, "Service request not found.", null);

        var now = DateTime.UtcNow;
        var activity = new TmzActivity
        {
            SrNumber = srNumber,
            ActivityType = "Note",
            Status = "Open",
            Subject = request.Subject.Trim(),
            Notes = TrimOrNull(request.Notes),
            AssignedTo = TrimOrNull(request.AssignedTo),
            DueDate = request.DueDate,
            CreatedBy = TrimOrNull(createdBy) ?? "Desk",
            IsSystemGenerated = false,
            CreatedAtUtc = now
        };

        _db.Activities.Add(activity);
        await _db.SaveChangesAsync(cancellationToken);
        return (true, null, MapActivity(activity));
    }

    public async Task<(bool Success, string? Error, ActivityDto? Activity)> UpdateActivityAsync(
        long activityId,
        UpdateActivityRequest request,
        CancellationToken cancellationToken = default)
    {
        var activity = await _db.Activities
            .Include(a => a.PlanStep)
            .FirstOrDefaultAsync(a => a.ActivityId == activityId, cancellationToken);

        if (activity is null)
            return (false, "Activity not found.", null);

        var now = DateTime.UtcNow;

        if (!string.IsNullOrWhiteSpace(request.Status))
        {
            var status = request.Status.Trim();
            if (!IsValidActivityStatus(status))
                return (false, "Status must be Open, In Progress, Completed, or Cancelled.", null);

            activity.Status = status;
            if (string.Equals(status, "Completed", StringComparison.OrdinalIgnoreCase))
                activity.CompletedAtUtc = now;
            else if (!string.Equals(status, "Completed", StringComparison.OrdinalIgnoreCase))
                activity.CompletedAtUtc = null;
        }

        if (!string.IsNullOrWhiteSpace(request.Subject))
            activity.Subject = request.Subject.Trim();

        if (request.Notes is not null)
            activity.Notes = TrimOrNull(request.Notes);

        if (request.AssignedTo is not null)
            activity.AssignedTo = TrimOrNull(request.AssignedTo);

        if (request.DueDate.HasValue)
            activity.DueDate = request.DueDate;

        activity.UpdatedAtUtc = now;
        await _db.SaveChangesAsync(cancellationToken);
        return (true, null, MapActivity(activity));
    }

    private async Task<TmzActivityPlan?> FindPlanForSubAreaAsync(string subArea, CancellationToken cancellationToken)
    {
        var plan = await _db.ActivityPlans
            .Include(p => p.Steps)
            .FirstOrDefaultAsync(p => p.IsActive && p.SubArea == subArea, cancellationToken);

        if (plan is not null) return plan;

        return await _db.ActivityPlans
            .Include(p => p.Steps)
            .FirstOrDefaultAsync(p => p.IsActive && p.SubArea == "Other", cancellationToken);
    }

    private async Task SpawnStepActivityAsync(
        TmzServiceRequest sr,
        TmzActivityPlan plan,
        int stepOrder,
        DateTime now,
        CancellationToken cancellationToken)
    {
        var step = plan.Steps.FirstOrDefault(s => s.StepOrder == stepOrder);
        if (step is null) return;

        var due = now.Date.AddDays(step.DueDaysOffset);
        var existing = await _db.Activities.AnyAsync(
            a => a.SrNumber == sr.SrNumber && a.PlanStepId == step.StepId && a.Status != "Cancelled",
            cancellationToken);

        if (existing) return;

        _db.Activities.Add(new TmzActivity
        {
            SrNumber = sr.SrNumber,
            PlanStepId = step.StepId,
            ActivityType = step.ActivityType,
            Status = "Open",
            Subject = step.Name,
            Notes = step.Description,
            AssignedTo = step.DefaultAssignee,
            DueDate = due,
            CreatedBy = "System",
            IsSystemGenerated = true,
            CreatedAtUtc = now
        });
    }

    private async Task AdvancePlanAsync(
        long srNumber,
        int targetStepOrder,
        DateTime now,
        CancellationToken cancellationToken)
    {
        var srPlan = await _db.SrActivityPlans
            .Include(p => p.Plan)
            .ThenInclude(p => p.Steps)
            .FirstOrDefaultAsync(p => p.SrNumber == srNumber, cancellationToken);

        if (srPlan is null || srPlan.Status != "Active") return;

        var sr = await _db.ServiceRequests.FirstAsync(s => s.SrNumber == srNumber, cancellationToken);

        if (targetStepOrder > srPlan.CurrentStepOrder)
            srPlan.CurrentStepOrder = targetStepOrder;

        await SpawnStepActivityAsync(sr, srPlan.Plan, targetStepOrder, now, cancellationToken);
    }

    private async Task CompleteSrPlanAsync(long srNumber, DateTime now, CancellationToken cancellationToken)
    {
        var srPlan = await _db.SrActivityPlans
            .FirstOrDefaultAsync(p => p.SrNumber == srNumber, cancellationToken);

        if (srPlan is null || srPlan.Status == "Completed") return;

        srPlan.Status = "Completed";
        srPlan.CompletedAtUtc = now;
    }

    private async Task CompleteOpenPlanActivitiesAsync(long srNumber, DateTime now, CancellationToken cancellationToken)
    {
        var open = await _db.Activities
            .Where(a => a.SrNumber == srNumber && a.Status != "Completed" && a.Status != "Cancelled")
            .ToListAsync(cancellationToken);

        foreach (var a in open)
        {
            a.Status = "Completed";
            a.CompletedAtUtc = now;
            a.UpdatedAtUtc = now;
        }
    }

    private async Task CompleteActivitiesByTypeAsync(
        long srNumber,
        IEnumerable<string> types,
        DateTime now,
        CancellationToken cancellationToken)
    {
        var typeSet = types.ToHashSet(StringComparer.OrdinalIgnoreCase);
        var activities = await _db.Activities
            .Where(a => a.SrNumber == srNumber && a.Status != "Completed" && a.Status != "Cancelled")
            .ToListAsync(cancellationToken);

        foreach (var a in activities.Where(a => typeSet.Contains(a.ActivityType)))
        {
            a.Status = "Completed";
            a.CompletedAtUtc = now;
            a.UpdatedAtUtc = now;
        }
    }

    private async Task LogSystemAsync(
        long srNumber,
        string type,
        string subject,
        string? notes,
        string? createdBy,
        DateTime now,
        CancellationToken cancellationToken)
    {
        _db.Activities.Add(new TmzActivity
        {
            SrNumber = srNumber,
            ActivityType = type,
            Status = "Completed",
            Subject = subject,
            Notes = notes,
            CreatedBy = createdBy ?? "System",
            IsSystemGenerated = true,
            CreatedAtUtc = now,
            CompletedAtUtc = now
        });
        await Task.CompletedTask;
    }

    private static bool IsValidActivityStatus(string status) =>
        string.Equals(status, "Open", StringComparison.OrdinalIgnoreCase)
        || string.Equals(status, "In Progress", StringComparison.OrdinalIgnoreCase)
        || string.Equals(status, "Completed", StringComparison.OrdinalIgnoreCase)
        || string.Equals(status, "Cancelled", StringComparison.OrdinalIgnoreCase);

    private static string? TrimOrNull(string? value)
    {
        var trimmed = value?.Trim();
        return string.IsNullOrEmpty(trimmed) ? null : trimmed;
    }

    private static ActivityDto MapActivity(TmzActivity a) => new()
    {
        ActivityId = a.ActivityId,
        SrNumber = a.SrNumber,
        PlanStepId = a.PlanStepId,
        PlanStepOrder = a.PlanStep?.StepOrder,
        ActivityType = a.ActivityType,
        Status = a.Status,
        Subject = a.Subject,
        Notes = a.Notes,
        AssignedTo = a.AssignedTo,
        DueDate = a.DueDate,
        CompletedAtUtc = a.CompletedAtUtc,
        CreatedBy = a.CreatedBy,
        IsSystemGenerated = a.IsSystemGenerated,
        CreatedAtUtc = a.CreatedAtUtc
    };
}
