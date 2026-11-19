using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace ZurichTreeManagement.Web.Data.Entities;

[Table("TMZ_ActivityPlanStep")]
public sealed class TmzActivityPlanStep
{
    [Key]
    [DatabaseGenerated(DatabaseGeneratedOption.Identity)]
    public int StepId { get; set; }

    public int PlanId { get; set; }

    public int StepOrder { get; set; }

    [MaxLength(256)]
    public string Name { get; set; } = "";

    [MaxLength(64)]
    public string ActivityType { get; set; } = "";

    [MaxLength(128)]
    public string? DefaultAssignee { get; set; }

    public int DueDaysOffset { get; set; }

    [MaxLength(512)]
    public string? Description { get; set; }

    public TmzActivityPlan Plan { get; set; } = null!;
}
