namespace ZurichTreeManagement.Web.Models;

public sealed class SrListItemDto
{
    public long SrNumber { get; set; }
    public string Status { get; set; } = "";
    public string? SubStatus { get; set; }
    public string Phase { get; set; } = "sr";
    public string Priority { get; set; } = "Normal";
    public string SubArea { get; set; } = "";
    public string RequestType { get; set; } = "";
    public string LinkedTreeBaumnummer { get; set; } = "";
    public string ContactName { get; set; } = "";
    public string? Address { get; set; }
    public string? AssignedTo { get; set; }
    public double Lat { get; set; }
    public double Lng { get; set; }
    public DateTime OpenedAtUtc { get; set; }
    public DateTime? ClosedDate { get; set; }
}
