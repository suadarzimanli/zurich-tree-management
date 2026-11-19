using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace ZurichTreeManagement.Web.Data.Entities;

[Table("TMZ_Inspection")]
public sealed class TmzInspection
{
    [Key]
    [DatabaseGenerated(DatabaseGeneratedOption.Identity)]
    public long InspectionId { get; set; }

    public long SrNumber { get; set; }

    [MaxLength(64)]
    public string Status { get; set; } = "Created";

    [MaxLength(64)]
    public string LinkedTreeBaumnummer { get; set; } = "";

    public DateTime? InspectDate { get; set; }

    [MaxLength(128)]
    public string? Inspector { get; set; }

    [MaxLength(64)]
    public string? Findings { get; set; }

    [MaxLength(32)]
    public string? Priority { get; set; }

    public bool EHAP { get; set; }

    public string? Comment { get; set; }

    public string? InternalComment { get; set; }

    [MaxLength(100)]
    public string? WorkOrderType { get; set; }

    public double GisLatitude { get; set; }

    public double GisLongitude { get; set; }

    public DateTime CreatedAtUtc { get; set; }

    public DateTime? ClosedAtUtc { get; set; }

    public DateTime? UpdatedAtUtc { get; set; }

    public TmzServiceRequest ServiceRequest { get; set; } = null!;

    public TmzWorkOrder? WorkOrder { get; set; }
}
