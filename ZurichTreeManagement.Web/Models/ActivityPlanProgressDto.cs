namespace ZurichTreeManagement.Web.Models;

public sealed class ActivityPlanStepDto
{
    public int StepId { get; set; }
    public int StepOrder { get; set; }
    public string Name { get; set; } = "";
    public string ActivityType { get; set; } = "";
    public string? Description { get; set; }
    public bool IsCurrent { get; set; }
    public bool IsCompleted { get; set; }
}

public sealed class ActivityPlanProgressDto
{
    public long SrNumber { get; set; }
    public string PlanName { get; set; } = "";
    public string SubArea { get; set; } = "";
    public int CurrentStepOrder { get; set; }
    public string Status { get; set; } = "";
    public IReadOnlyList<ActivityPlanStepDto> Steps { get; set; } = Array.Empty<ActivityPlanStepDto>();
}
