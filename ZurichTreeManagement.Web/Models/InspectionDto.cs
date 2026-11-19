namespace ZurichTreeManagement.Web.Models;

public sealed class InspectionDto
{
    public long InspectionId { get; set; }
    public long SrNumber { get; set; }
    public string Status { get; set; } = "";
    public string LinkedTreeBaumnummer { get; set; } = "";
    public DateTime? InspectDate { get; set; }
    public string? Inspector { get; set; }
    public string? Findings { get; set; }
    public string? Priority { get; set; }
    public bool EHAP { get; set; }
    public string? Comment { get; set; }
    public string? InternalComment { get; set; }
    public string? WorkOrderType { get; set; }
    public double Lat { get; set; }
    public double Lng { get; set; }
    public DateTime CreatedAtUtc { get; set; }
    public DateTime? ClosedAtUtc { get; set; }
}
