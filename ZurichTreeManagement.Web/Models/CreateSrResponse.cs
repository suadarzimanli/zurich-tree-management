namespace ZurichTreeManagement.Web.Models;

public sealed class CreateSrResponse
{
    public bool Success { get; set; }
    public long SrNumber { get; set; }
    public long? InspectionId { get; set; }
    public string? Error { get; set; }
}
