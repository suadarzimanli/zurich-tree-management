using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace ZurichTreeManagement.Web.Data.Entities;

[Table("TMZ_WorkOrder")]
public sealed class TmzWorkOrder
{
    [Key]
    [DatabaseGenerated(DatabaseGeneratedOption.Identity)]
    public long WorkOrderId { get; set; }

    public long SrNumber { get; set; }

    public long InspectionId { get; set; }

    [MaxLength(64)]
    public string Status { get; set; } = "Created";

    [MaxLength(100)]
    public string WorkOrderType { get; set; } = "Unassigned";

    [MaxLength(32)]
    public string? Priority { get; set; }

    [MaxLength(128)]
    public string? AssignedTo { get; set; }

    [MaxLength(128)]
    public string? InspBy { get; set; }

    [MaxLength(64)]
    public string? ProjectCode { get; set; }

    [MaxLength(64)]
    public string LinkedTreeBaumnummer { get; set; } = "";

    public string? InternalComment { get; set; }

    [MaxLength(400)]
    public string? Contractor { get; set; }

    public string? FieldComments { get; set; }

    public double GisLatitude { get; set; }

    public double GisLongitude { get; set; }

    public DateTime? StartDate { get; set; }

    public DateTime? WorkDate { get; set; }

    public DateTime CreatedAtUtc { get; set; }

    public DateTime? ClosedAtUtc { get; set; }

    public DateTime? UpdatedAtUtc { get; set; }

    public TmzServiceRequest ServiceRequest { get; set; } = null!;

    public TmzInspection Inspection { get; set; } = null!;
}
