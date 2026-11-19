namespace ZurichTreeManagement.Web.Models;

public sealed class ActivityDto
{
    public long ActivityId { get; set; }
    public long SrNumber { get; set; }
    public int? PlanStepId { get; set; }
    public int? PlanStepOrder { get; set; }
    public string ActivityType { get; set; } = "";
    public string Status { get; set; } = "";
    public string Subject { get; set; } = "";
    public string? Notes { get; set; }
    public string? AssignedTo { get; set; }
    public DateTime? DueDate { get; set; }
    public DateTime? CompletedAtUtc { get; set; }
    public string? CreatedBy { get; set; }
    public bool IsSystemGenerated { get; set; }
    public DateTime CreatedAtUtc { get; set; }
}
