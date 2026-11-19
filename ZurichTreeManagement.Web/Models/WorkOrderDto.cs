namespace ZurichTreeManagement.Web.Models;

public sealed class WorkOrderDto
{
    public long WorkOrderId { get; set; }
    public long SrNumber { get; set; }
    public long InspectionId { get; set; }
    public string Status { get; set; } = "";
    public string WorkOrderType { get; set; } = "";
    public string? Priority { get; set; }
    public string? AssignedTo { get; set; }
    public string? InspBy { get; set; }
    public string? ProjectCode { get; set; }
    public string LinkedTreeBaumnummer { get; set; } = "";
    public string? Contractor { get; set; }
    public string? FieldComments { get; set; }
    public string? InternalComment { get; set; }
    public DateTime? StartDate { get; set; }
    public DateTime? WorkDate { get; set; }
    public double Lat { get; set; }
    public double Lng { get; set; }
    public DateTime CreatedAtUtc { get; set; }
    public DateTime? ClosedAtUtc { get; set; }
}
