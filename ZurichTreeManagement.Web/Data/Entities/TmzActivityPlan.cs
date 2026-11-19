using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace ZurichTreeManagement.Web.Data.Entities;

[Table("TMZ_ActivityPlan")]
public sealed class TmzActivityPlan
{
    [Key]
    [DatabaseGenerated(DatabaseGeneratedOption.Identity)]
    public int PlanId { get; set; }

    [MaxLength(128)]
    public string SubArea { get; set; } = "";

    [MaxLength(256)]
    public string Name { get; set; } = "";

    public bool IsActive { get; set; } = true;

    public DateTime CreatedAtUtc { get; set; }

    public ICollection<TmzActivityPlanStep> Steps { get; set; } = new List<TmzActivityPlanStep>();
}
