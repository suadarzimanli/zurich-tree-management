using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace ZurichTreeManagement.Web.Data.Entities;

[Table("TMZ_SrActivityPlan")]
public sealed class TmzSrActivityPlan
{
    [Key]
    [DatabaseGenerated(DatabaseGeneratedOption.Identity)]
    public long SrPlanId { get; set; }

    public long SrNumber { get; set; }

    public int PlanId { get; set; }

    public int CurrentStepOrder { get; set; } = 1;

    [MaxLength(32)]
    public string Status { get; set; } = "Active";

    public DateTime StartedAtUtc { get; set; }

    public DateTime? CompletedAtUtc { get; set; }

    public TmzServiceRequest ServiceRequest { get; set; } = null!;

    public TmzActivityPlan Plan { get; set; } = null!;
}
