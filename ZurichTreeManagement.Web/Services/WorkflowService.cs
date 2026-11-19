using Microsoft.EntityFrameworkCore;
using ZurichTreeManagement.Web.Data;
using ZurichTreeManagement.Web.Data.Entities;
using ZurichTreeManagement.Web.Models;

namespace ZurichTreeManagement.Web.Services;

public sealed class WorkflowService
{
    private readonly ZurichDbContext _db;
    private readonly ILogger<WorkflowService> _logger;
    private readonly ActivityService _activities;

    public WorkflowService(
        ZurichDbContext db,
        ILogger<WorkflowService> logger,
        ActivityService activities)
    {
        _db = db;
        _logger = logger;
        _activities = activities;
    }

    public async Task<CreateSrResponse> CreateFromMapAsync(CreateSrRequest request, CancellationToken cancellationToken = default)
    {
        var now = DateTime.UtcNow;
        var subArea = ZurichRequestTopics.ResolveSubArea(request.RequestType);
        var area = ZurichRequestTopics.ResolveArea(request.RequestType);
        var priority = ZurichRequestTopics.ResolvePriority(request.RequestType);

        var description = string.IsNullOrWhiteSpace(request.Description)
            ? null
            : request.Description.Trim();

        var sr = new TmzServiceRequest
        {
            Status = "In Progress",
            SubStatus = "Inspection Created",
            Priority = priority,
            Area = area,
            SubArea = subArea,
            RequestType = request.RequestType.Trim(),
            LinkedTreeBaumnummer = request.LinkedTreeBaumnummer.Trim(),
            OgdObjectId = request.OgdObjectId,
            OgdSpeciesGerman = TrimOrNull(request.OgdSpeciesGerman),
            OgdSpeciesLatin = TrimOrNull(request.OgdSpeciesLatin),
            OgdQuartier = TrimOrNull(request.OgdQuartier),
            OgdStreet = TrimOrNull(request.OgdStreet),
            OgdPlantingYear = request.OgdPlantingYear,
            OgdCategory = TrimOrNull(request.OgdCategory),
            OgdStatus = TrimOrNull(request.OgdStatus),
            ContactFirstName = request.FirstName.Trim(),
            ContactLastName = request.LastName.Trim(),
            ContactEmail = request.Email.Trim(),
            ContactPhone = TrimOrNull(request.Phone),
            Description = description,
            Address = request.Address.Trim(),
            GisLatitude = request.Lat,
            GisLongitude = request.Lng,
            OpenedDate = now,
            Source = "Map App",
            CreatedBy = "Map App",
            CreatedAtUtc = now
        };

        await using var tx = await _db.Database.BeginTransactionAsync(cancellationToken);
        try
        {
            _db.ServiceRequests.Add(sr);
            await _db.SaveChangesAsync(cancellationToken);

            var inspection = new TmzInspection
            {
                SrNumber = sr.SrNumber,
                Status = "Created",
                LinkedTreeBaumnummer = sr.LinkedTreeBaumnummer,
                Priority = priority,
                GisLatitude = sr.GisLatitude,
                GisLongitude = sr.GisLongitude,
                CreatedAtUtc = now
            };
            _db.Inspections.Add(inspection);
            await _db.SaveChangesAsync(cancellationToken);
            await tx.CommitAsync(cancellationToken);

            await _activities.OnSrCreatedAsync(sr, cancellationToken);

            _logger.LogInformation("Created SR {SrNumber} with inspection {InspectionId}", sr.SrNumber, inspection.InspectionId);

            return new CreateSrResponse
            {
                Success = true,
                SrNumber = sr.SrNumber,
                InspectionId = inspection.InspectionId
            };
        }
        catch (Exception ex)
        {
            await tx.RollbackAsync(cancellationToken);
            _logger.LogError(ex, "Failed to create SR from map");
            return new CreateSrResponse { Success = false, Error = "Database error while creating service request." };
        }
    }

    public async Task<SrDetailDto?> GetSrAsync(long srNumber, CancellationToken cancellationToken = default)
    {
        var sr = await _db.ServiceRequests
            .AsNoTracking()
            .Include(s => s.Inspection)
            .Include(s => s.WorkOrder)
            .FirstOrDefaultAsync(s => s.SrNumber == srNumber, cancellationToken);

        return sr is null ? null : MapSrDetail(sr);
    }

    public async Task<InspectionDto?> GetInspectionBySrAsync(long srNumber, CancellationToken cancellationToken = default)
    {
        var inspection = await _db.Inspections
            .AsNoTracking()
            .FirstOrDefaultAsync(i => i.SrNumber == srNumber, cancellationToken);

        return inspection is null ? null : MapInspection(inspection);
    }

    public async Task<WorkOrderDto?> GetWorkOrderBySrAsync(long srNumber, CancellationToken cancellationToken = default)
    {
        var workOrder = await _db.WorkOrders
            .AsNoTracking()
            .FirstOrDefaultAsync(w => w.SrNumber == srNumber, cancellationToken);

        return workOrder is null ? null : MapWorkOrder(workOrder);
    }

    public async Task<(bool Success, string? Error, InspectionDto? Inspection)> CreateInspectionForSrAsync(
        long srNumber,
        CancellationToken cancellationToken = default)
    {
        var sr = await _db.ServiceRequests
            .Include(s => s.Inspection)
            .FirstOrDefaultAsync(s => s.SrNumber == srNumber, cancellationToken);

        if (sr is null)
            return (false, "Service request not found.", null);

        if (sr.Inspection is not null)
            return (false, "Inspection already exists for this SR.", MapInspection(sr.Inspection));

        var now = DateTime.UtcNow;
        var inspection = new TmzInspection
        {
            SrNumber = sr.SrNumber,
            Status = "Created",
            LinkedTreeBaumnummer = sr.LinkedTreeBaumnummer,
            Priority = sr.Priority,
            GisLatitude = sr.GisLatitude,
            GisLongitude = sr.GisLongitude,
            CreatedAtUtc = now
        };

        sr.SubStatus = "Inspection Created";
        sr.UpdatedAtUtc = now;
        _db.Inspections.Add(inspection);

        try
        {
            await _db.SaveChangesAsync(cancellationToken);
            return (true, null, MapInspection(inspection));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to create inspection for SR {SrNumber}", srNumber);
            return (false, "Database error while creating inspection.", null);
        }
    }

    public async Task<(bool Success, string? Error, InspectionDto? Inspection, WorkOrderDto? WorkOrder)> UpdateInspectionAsync(
        long inspectionId,
        UpdateInspectionRequest request,
        CancellationToken cancellationToken = default)
    {
        var inspection = await _db.Inspections
            .Include(i => i.ServiceRequest)
            .FirstOrDefaultAsync(i => i.InspectionId == inspectionId, cancellationToken);

        if (inspection is null)
            return (false, "Inspection not found.", null, null);

        if (!string.Equals(inspection.Status, "Created", StringComparison.OrdinalIgnoreCase))
            return (false, "Inspection is already closed.", MapInspection(inspection), null);

        var newStatus = (request.Status ?? "").Trim();
        if (string.IsNullOrEmpty(newStatus))
            newStatus = "Created";

        if (!IsValidInspectionTransition(newStatus))
            return (false, "Status must be Created, No Work, or Resolution.", null, null);

        var now = DateTime.UtcNow;
        var comment = TrimOrNull(request.Comment);
        var internalComment = TrimOrNull(request.InternalComment);

        inspection.Comment = comment ?? inspection.Comment;
        inspection.InternalComment = internalComment ?? inspection.InternalComment;
        inspection.Inspector = TrimOrNull(request.Inspector) ?? inspection.Inspector;
        inspection.Findings = TrimOrNull(request.Findings) ?? inspection.Findings;
        inspection.Priority = TrimOrNull(request.Priority) ?? inspection.Priority ?? inspection.ServiceRequest.Priority;
        if (request.EHAP.HasValue)
            inspection.EHAP = request.EHAP.Value;

        if (request.InspectDate.HasValue)
            inspection.InspectDate = request.InspectDate;

        var isClosing = !string.Equals(newStatus, "Created", StringComparison.OrdinalIgnoreCase);
        if (isClosing)
        {
            if (!HasAnyComment(inspection.Comment, inspection.InternalComment))
                return (false, "A comment or internal comment is required when closing an inspection.", null, null);

            if (!inspection.InspectDate.HasValue)
                inspection.InspectDate = now.Date;
        }

        if (string.Equals(newStatus, "Resolution", StringComparison.OrdinalIgnoreCase))
        {
            var woType = TrimOrNull(request.WorkOrderType) ?? TrimOrNull(inspection.WorkOrderType);
            if (string.IsNullOrEmpty(woType) || string.Equals(woType, "Unassigned", StringComparison.OrdinalIgnoreCase))
                return (false, "Work order type is required for Resolution.", null, null);

            inspection.WorkOrderType = woType;
        }
        else if (!string.IsNullOrWhiteSpace(request.WorkOrderType))
        {
            inspection.WorkOrderType = TrimOrNull(request.WorkOrderType);
        }

        WorkOrderDto? workOrderDto = null;

        if (string.Equals(newStatus, "Created", StringComparison.OrdinalIgnoreCase))
        {
            inspection.UpdatedAtUtc = now;
            await _db.SaveChangesAsync(cancellationToken);
            return (true, null, MapInspection(inspection), null);
        }

        await using var tx = await _db.Database.BeginTransactionAsync(cancellationToken);
        try
        {
            inspection.Status = newStatus;
            inspection.ClosedAtUtc = now;
            inspection.UpdatedAtUtc = now;

            var sr = inspection.ServiceRequest;

            if (string.Equals(newStatus, "No Work", StringComparison.OrdinalIgnoreCase))
            {
                sr.Status = "Closed";
                sr.SubStatus = "No Work";
                sr.ClosedDate = now;
                sr.UpdatedAtUtc = now;
            }
            else if (string.Equals(newStatus, "Resolution", StringComparison.OrdinalIgnoreCase))
            {
                var woType = inspection.WorkOrderType ?? "Unassigned";
                var workOrder = new TmzWorkOrder
                {
                    SrNumber = sr.SrNumber,
                    InspectionId = inspection.InspectionId,
                    Status = "Created",
                    WorkOrderType = woType,
                    Priority = inspection.Priority ?? sr.Priority,
                    InspBy = inspection.Inspector,
                    LinkedTreeBaumnummer = sr.LinkedTreeBaumnummer,
                    InternalComment = inspection.InternalComment,
                    GisLatitude = sr.GisLatitude,
                    GisLongitude = sr.GisLongitude,
                    StartDate = now,
                    CreatedAtUtc = now
                };
                _db.WorkOrders.Add(workOrder);
                sr.SubStatus = "Work Order Created";
                sr.UpdatedAtUtc = now;

                await _db.SaveChangesAsync(cancellationToken);
                workOrderDto = MapWorkOrder(workOrder);
            }

            await _db.SaveChangesAsync(cancellationToken);
            await tx.CommitAsync(cancellationToken);

            await _activities.OnInspectionClosedAsync(inspection.SrNumber, newStatus, cancellationToken);

            return (true, null, MapInspection(inspection), workOrderDto);
        }
        catch (Exception ex)
        {
            await tx.RollbackAsync(cancellationToken);
            _logger.LogError(ex, "Failed to update inspection {InspectionId}", inspectionId);
            return (false, "Database error while updating inspection.", null, null);
        }
    }

    public async Task<(bool Success, string? Error, WorkOrderDto? WorkOrder)> ResolveWorkOrderAsync(
        long workOrderId,
        UpdateWorkOrderRequest request,
        CancellationToken cancellationToken = default)
    {
        var workOrder = await _db.WorkOrders
            .Include(w => w.ServiceRequest)
            .FirstOrDefaultAsync(w => w.WorkOrderId == workOrderId, cancellationToken);

        if (workOrder is null)
            return (false, "Work order not found.", null);

        if (!string.Equals(workOrder.Status, "Created", StringComparison.OrdinalIgnoreCase))
            return (false, "Work order is already closed.", MapWorkOrder(workOrder));

        var newStatus = (request.Status ?? "").Trim();
        if (!string.Equals(newStatus, "Resolved", StringComparison.OrdinalIgnoreCase))
            return (false, "Only Resolved is allowed from Created.", null);

        if (!request.WorkDate.HasValue)
            return (false, "Work date is required when resolving a work order.", null);

        var fieldComments = TrimOrNull(request.FieldComments) ?? workOrder.FieldComments;
        var internalComment = TrimOrNull(request.InternalComment) ?? workOrder.InternalComment;
        if (!HasAnyComment(fieldComments, internalComment))
            return (false, "Field comments or an internal comment is required when resolving a work order.", null);

        var now = DateTime.UtcNow;
        workOrder.Contractor = TrimOrNull(request.Contractor) ?? workOrder.Contractor;
        workOrder.AssignedTo = TrimOrNull(request.AssignedTo) ?? workOrder.AssignedTo;
        workOrder.ProjectCode = TrimOrNull(request.ProjectCode) ?? workOrder.ProjectCode;
        workOrder.FieldComments = fieldComments;
        workOrder.InternalComment = internalComment;
        workOrder.WorkDate = request.WorkDate;

        workOrder.Status = "Resolved";
        workOrder.ClosedAtUtc = now;
        workOrder.UpdatedAtUtc = now;

        var sr = workOrder.ServiceRequest;
        sr.Status = "Closed";
        sr.SubStatus = "Complete";
        sr.ClosedDate = now;
        sr.UpdatedAtUtc = now;

        try
        {
            await _db.SaveChangesAsync(cancellationToken);
            await _activities.OnWorkOrderResolvedAsync(sr.SrNumber, cancellationToken);
            return (true, null, MapWorkOrder(workOrder));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to resolve work order {WorkOrderId}", workOrderId);
            return (false, "Database error while resolving work order.", null);
        }
    }

    public async Task<IReadOnlyList<MapMarkerDto>> GetMapMarkersAsync(
        MapMarkerFilter? filter = null,
        CancellationToken cancellationToken = default)
    {
        var query = _db.ServiceRequests
            .AsNoTracking()
            .Include(s => s.Inspection)
            .Include(s => s.WorkOrder)
            .Where(s => s.GisLatitude != 0 || s.GisLongitude != 0);

        if (!string.IsNullOrWhiteSpace(filter?.Status))
        {
            var status = filter.Status.Trim();
            query = query.Where(s => s.Status == status);
        }

        if (!string.IsNullOrWhiteSpace(filter?.SubArea))
        {
            var subArea = filter.SubArea.Trim();
            query = query.Where(s => s.SubArea == subArea);
        }

        if (!string.IsNullOrWhiteSpace(filter?.Priority))
        {
            var priority = filter.Priority.Trim();
            query = query.Where(s => s.Priority == priority);
        }

        if (filter?.CreatedFrom is not null)
            query = query.Where(s => s.CreatedAtUtc >= filter.CreatedFrom.Value);

        if (filter?.CreatedTo is not null)
        {
            var end = filter.CreatedTo.Value.Date.AddDays(1);
            query = query.Where(s => s.CreatedAtUtc < end);
        }

        var srs = await query
            .OrderByDescending(s => s.OpenedDate)
            .Take(5000)
            .ToListAsync(cancellationToken);

        if (!string.IsNullOrWhiteSpace(filter?.Phase))
        {
            var phase = filter.Phase.Trim().ToLowerInvariant();
            srs = srs.Where(s => string.Equals(ResolvePhase(s), phase, StringComparison.OrdinalIgnoreCase)).ToList();
        }

        return srs.Select(BuildMarker).ToList();
    }

    public async Task<SrListResponse> GetSrListAsync(
        SrListFilter? filter = null,
        CancellationToken cancellationToken = default)
    {
        filter ??= new SrListFilter();

        var query = _db.ServiceRequests
            .AsNoTracking()
            .Include(s => s.Inspection)
            .Include(s => s.WorkOrder)
            .AsQueryable();

        if (!string.IsNullOrWhiteSpace(filter.Status))
        {
            var status = filter.Status.Trim();
            query = query.Where(s => s.Status == status);
        }

        if (!string.IsNullOrWhiteSpace(filter.SubArea))
        {
            var subArea = filter.SubArea.Trim();
            query = query.Where(s => s.SubArea == subArea);
        }

        if (!string.IsNullOrWhiteSpace(filter.Priority))
        {
            var priority = filter.Priority.Trim();
            query = query.Where(s => s.Priority == priority);
        }

        if (!string.IsNullOrWhiteSpace(filter.AssignedTo))
        {
            var assigned = filter.AssignedTo.Trim();
            query = query.Where(s => s.AssignedTo != null && s.AssignedTo.Contains(assigned));
        }

        if (filter.CreatedFrom is not null)
            query = query.Where(s => s.OpenedDate >= filter.CreatedFrom.Value);

        if (filter.CreatedTo is not null)
        {
            var end = filter.CreatedTo.Value.Date.AddDays(1);
            query = query.Where(s => s.OpenedDate < end);
        }

        if (!string.IsNullOrWhiteSpace(filter.Search))
        {
            var term = filter.Search.Trim();
            if (TryParseSrNumberFromSearch(term, out var srNum))
            {
                query = query.Where(s => s.SrNumber == srNum);
            }
            else
            {
                query = query.Where(s =>
                    s.LinkedTreeBaumnummer.Contains(term)
                    || (s.Address != null && s.Address.Contains(term))
                    || (s.Description != null && s.Description.Contains(term))
                    || s.ContactFirstName.Contains(term)
                    || s.ContactLastName.Contains(term)
                    || (s.ContactEmail != null && s.ContactEmail.Contains(term))
                    || s.RequestType.Contains(term));
            }
        }

        var srs = await query
            .OrderByDescending(s => s.OpenedDate)
            .Take(2000)
            .ToListAsync(cancellationToken);

        if (!string.IsNullOrWhiteSpace(filter.Phase))
        {
            var phase = filter.Phase.Trim().ToLowerInvariant();
            srs = srs.Where(s => string.Equals(ResolvePhase(s), phase, StringComparison.OrdinalIgnoreCase)).ToList();
        }

        var items = srs.Select(MapListItem).ToList();
        return new SrListResponse { Items = items, Total = items.Count };
    }

    public async Task<(bool Success, string? Error, SrDetailDto? Detail)> UpdateSrAsync(
        long srNumber,
        UpdateSrRequest request,
        CancellationToken cancellationToken = default)
    {
        var sr = await _db.ServiceRequests
            .Include(s => s.Inspection)
            .Include(s => s.WorkOrder)
            .FirstOrDefaultAsync(s => s.SrNumber == srNumber, cancellationToken);

        if (sr is null)
            return (false, "Service request not found.", null);

        var now = DateTime.UtcNow;
        var previousStatus = sr.Status;

        if (!string.IsNullOrWhiteSpace(request.Status))
        {
            var status = request.Status.Trim();
            if (!string.Equals(status, "In Progress", StringComparison.OrdinalIgnoreCase)
                && !string.Equals(status, "Closed", StringComparison.OrdinalIgnoreCase))
            {
                return (false, "Status must be In Progress or Closed.", null);
            }

            sr.Status = string.Equals(status, "Closed", StringComparison.OrdinalIgnoreCase) ? "Closed" : "In Progress";
            if (sr.Status == "Closed" && sr.ClosedDate is null)
                sr.ClosedDate = now;
            else if (sr.Status != "Closed")
                sr.ClosedDate = null;
        }

        if (request.SubStatus is not null)
            sr.SubStatus = TrimOrNull(request.SubStatus);

        if (!string.IsNullOrWhiteSpace(request.Priority))
        {
            var priority = request.Priority.Trim();
            if (!string.Equals(priority, "Normal", StringComparison.OrdinalIgnoreCase)
                && !string.Equals(priority, "Urgent", StringComparison.OrdinalIgnoreCase))
            {
                return (false, "Priority must be Normal or Urgent.", null);
            }

            sr.Priority = string.Equals(priority, "Urgent", StringComparison.OrdinalIgnoreCase) ? "Urgent" : "Normal";
        }

        if (request.AssignedTo is not null)
            sr.AssignedTo = TrimOrNull(request.AssignedTo);

        if (request.Description is not null)
            sr.Description = TrimOrNull(request.Description);

        if (request.Address is not null)
            sr.Address = TrimOrNull(request.Address);

        if (!string.IsNullOrWhiteSpace(request.FirstName))
            sr.ContactFirstName = request.FirstName.Trim();

        if (!string.IsNullOrWhiteSpace(request.LastName))
            sr.ContactLastName = request.LastName.Trim();

        if (!string.IsNullOrWhiteSpace(request.Email))
            sr.ContactEmail = request.Email.Trim();

        if (request.Phone is not null)
            sr.ContactPhone = TrimOrNull(request.Phone);

        sr.UpdatedAtUtc = now;
        await _db.SaveChangesAsync(cancellationToken);

        if (!string.IsNullOrWhiteSpace(request.Status))
            await _activities.OnSrStatusChangedAsync(srNumber, previousStatus, sr.Status, null, cancellationToken);

        return (true, null, MapSrDetail(sr));
    }

    private static MapMarkerDto BuildMarker(TmzServiceRequest sr)
    {
        var phase = ResolvePhase(sr);
        return new MapMarkerDto
        {
            SrNumber = sr.SrNumber,
            Lat = sr.GisLatitude,
            Lng = sr.GisLongitude,
            Phase = phase,
            IconKey = phase,
            Title = BuildMarkerTitle(sr, phase),
            Status = sr.Status,
            SubArea = sr.SubArea,
            Priority = sr.Priority,
            LinkedTreeBaumnummer = sr.LinkedTreeBaumnummer,
            InspectionId = sr.Inspection?.InspectionId,
            InspectionStatus = sr.Inspection?.Status,
            WorkOrderId = sr.WorkOrder?.WorkOrderId,
            WorkOrderStatus = sr.WorkOrder?.Status
        };
    }

    private static string ResolvePhase(TmzServiceRequest sr)
    {
        if (string.Equals(sr.Status, "Closed", StringComparison.OrdinalIgnoreCase))
            return "closed";

        if (sr.WorkOrder is not null && string.Equals(sr.WorkOrder.Status, "Created", StringComparison.OrdinalIgnoreCase))
            return "workorder";

        if (sr.Inspection is not null && string.Equals(sr.Inspection.Status, "Created", StringComparison.OrdinalIgnoreCase))
            return "inspection";

        return "sr";
    }

    private static string BuildMarkerTitle(TmzServiceRequest sr, string phase) =>
        phase switch
        {
            "workorder" => $"SR {sr.SrNumber} (work order step)",
            "inspection" => $"SR {sr.SrNumber} (inspection step)",
            "closed" => $"SR {sr.SrNumber} (closed)",
            _ => $"SR {sr.SrNumber}"
        };

    private static bool IsValidInspectionTransition(string status) =>
        string.Equals(status, "Created", StringComparison.OrdinalIgnoreCase)
        || string.Equals(status, "No Work", StringComparison.OrdinalIgnoreCase)
        || string.Equals(status, "Resolution", StringComparison.OrdinalIgnoreCase);

    private static bool HasAnyComment(string? a, string? b) =>
        !string.IsNullOrWhiteSpace(a) || !string.IsNullOrWhiteSpace(b);

    private static string? TrimOrNull(string? value)
    {
        var trimmed = value?.Trim();
        return string.IsNullOrEmpty(trimmed) ? null : trimmed;
    }

    private static SrDetailDto MapSrDetail(TmzServiceRequest sr) => new()
    {
        SrNumber = sr.SrNumber,
        Status = sr.Status,
        SubStatus = sr.SubStatus,
        Priority = sr.Priority,
        Area = sr.Area,
        SubArea = sr.SubArea,
        RequestType = sr.RequestType,
        LinkedTreeBaumnummer = sr.LinkedTreeBaumnummer,
        OgdSpeciesGerman = sr.OgdSpeciesGerman,
        OgdQuartier = sr.OgdQuartier,
        OgdStreet = sr.OgdStreet,
        FirstName = sr.ContactFirstName,
        LastName = sr.ContactLastName,
        Email = sr.ContactEmail,
        Phone = sr.ContactPhone,
        Description = sr.Description,
        Address = sr.Address ?? "",
        Lat = sr.GisLatitude,
        Lng = sr.GisLongitude,
        OpenedAtUtc = sr.OpenedDate,
        ClosedDate = sr.ClosedDate,
        CreatedBy = sr.CreatedBy,
        AssignedTo = sr.AssignedTo,
        Source = sr.Source,
        Inspection = sr.Inspection is null ? null : MapInspection(sr.Inspection),
        WorkOrder = sr.WorkOrder is null ? null : MapWorkOrder(sr.WorkOrder)
    };

    private static InspectionDto MapInspection(TmzInspection i) => new()
    {
        InspectionId = i.InspectionId,
        SrNumber = i.SrNumber,
        Status = i.Status,
        LinkedTreeBaumnummer = i.LinkedTreeBaumnummer,
        InspectDate = i.InspectDate,
        Inspector = i.Inspector,
        Findings = i.Findings,
        Priority = i.Priority,
        EHAP = i.EHAP,
        Comment = i.Comment,
        InternalComment = i.InternalComment,
        WorkOrderType = i.WorkOrderType,
        Lat = i.GisLatitude,
        Lng = i.GisLongitude,
        CreatedAtUtc = i.CreatedAtUtc,
        ClosedAtUtc = i.ClosedAtUtc
    };

    private static WorkOrderDto MapWorkOrder(TmzWorkOrder w) => new()
    {
        WorkOrderId = w.WorkOrderId,
        SrNumber = w.SrNumber,
        InspectionId = w.InspectionId,
        Status = w.Status,
        WorkOrderType = w.WorkOrderType,
        Priority = w.Priority,
        AssignedTo = w.AssignedTo,
        InspBy = w.InspBy,
        ProjectCode = w.ProjectCode,
        LinkedTreeBaumnummer = w.LinkedTreeBaumnummer,
        Contractor = w.Contractor,
        FieldComments = w.FieldComments,
        InternalComment = w.InternalComment,
        StartDate = w.StartDate,
        WorkDate = w.WorkDate,
        Lat = w.GisLatitude,
        Lng = w.GisLongitude,
        CreatedAtUtc = w.CreatedAtUtc,
        ClosedAtUtc = w.ClosedAtUtc
    };

    private static SrListItemDto MapListItem(TmzServiceRequest sr) => new()
    {
        SrNumber = sr.SrNumber,
        Status = sr.Status,
        SubStatus = sr.SubStatus,
        Phase = ResolvePhase(sr),
        Priority = sr.Priority,
        SubArea = sr.SubArea,
        RequestType = sr.RequestType,
        LinkedTreeBaumnummer = sr.LinkedTreeBaumnummer,
        ContactName = $"{sr.ContactFirstName} {sr.ContactLastName}".Trim(),
        Address = sr.Address,
        AssignedTo = sr.AssignedTo,
        Lat = sr.GisLatitude,
        Lng = sr.GisLongitude,
        OpenedAtUtc = sr.OpenedDate,
        ClosedDate = sr.ClosedDate
    };

    private static bool TryParseSrNumberFromSearch(string term, out long srNumber)
    {
        srNumber = 0;
        if (string.IsNullOrWhiteSpace(term)) return false;

        var normalized = term.Trim();
        if (normalized.StartsWith('#'))
            normalized = normalized[1..].TrimStart();

        if (normalized.StartsWith("SR", StringComparison.OrdinalIgnoreCase))
            normalized = normalized[2..].TrimStart();

        return long.TryParse(normalized, out srNumber) && srNumber > 0;
    }
}
