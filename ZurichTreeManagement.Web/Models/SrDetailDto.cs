namespace ZurichTreeManagement.Web.Models;

public sealed class SrDetailDto
{
    public long SrNumber { get; set; }
    public string Status { get; set; } = "";
    public string? SubStatus { get; set; }
    public string Priority { get; set; } = "Normal";
    public string Area { get; set; } = "";
    public string SubArea { get; set; } = "";
    public string RequestType { get; set; } = "";
    public string LinkedTreeBaumnummer { get; set; } = "";
    public string? OgdSpeciesGerman { get; set; }
    public string? OgdQuartier { get; set; }
    public string? OgdStreet { get; set; }
    public string FirstName { get; set; } = "";
    public string LastName { get; set; } = "";
    public string Email { get; set; } = "";
    public string? Phone { get; set; }
    public string? Description { get; set; }
    public string Address { get; set; } = "";
    public double Lat { get; set; }
    public double Lng { get; set; }
    public DateTime OpenedAtUtc { get; set; }
    public DateTime? ClosedDate { get; set; }
    public string? CreatedBy { get; set; }
    public string? AssignedTo { get; set; }
    public string Source { get; set; } = "";
    public InspectionDto? Inspection { get; set; }
    public WorkOrderDto? WorkOrder { get; set; }
}
