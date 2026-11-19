namespace ZurichTreeManagement.Web.Models;

public sealed class MapMarkerDto
{
    public long SrNumber { get; set; }
    public double Lat { get; set; }
    public double Lng { get; set; }
    public string Phase { get; set; } = "";
    public string IconKey { get; set; } = "";
    public string Title { get; set; } = "";
    public string Status { get; set; } = "";
    public string SubArea { get; set; } = "";
    public string Priority { get; set; } = "Normal";
    public string LinkedTreeBaumnummer { get; set; } = "";
    public long? InspectionId { get; set; }
    public string? InspectionStatus { get; set; }
    public long? WorkOrderId { get; set; }
    public string? WorkOrderStatus { get; set; }
}
