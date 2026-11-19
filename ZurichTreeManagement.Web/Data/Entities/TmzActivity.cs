using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace ZurichTreeManagement.Web.Data.Entities;

[Table("TMZ_Activity")]
public sealed class TmzActivity
{
    [Key]
    [DatabaseGenerated(DatabaseGeneratedOption.Identity)]
    public long ActivityId { get; set; }

    public long SrNumber { get; set; }

    public int? PlanStepId { get; set; }

    [MaxLength(64)]
    public string ActivityType { get; set; } = "";

    [MaxLength(32)]
    public string Status { get; set; } = "Open";

    [MaxLength(256)]
    public string Subject { get; set; } = "";

    public string? Notes { get; set; }

    [MaxLength(128)]
    public string? AssignedTo { get; set; }

    public DateTime? DueDate { get; set; }

    public DateTime? CompletedAtUtc { get; set; }

    [MaxLength(128)]
    public string? CreatedBy { get; set; }

    public bool IsSystemGenerated { get; set; }

    public DateTime CreatedAtUtc { get; set; }

    public DateTime? UpdatedAtUtc { get; set; }

    public TmzServiceRequest ServiceRequest { get; set; } = null!;

    public TmzActivityPlanStep? PlanStep { get; set; }
}
