namespace ZurichTreeManagement.Web.Models;

public sealed class MapMarkerFilter
{
    public string? Status { get; set; }
    public string? Phase { get; set; }
    public string? SubArea { get; set; }
    public string? Priority { get; set; }
    public DateTime? CreatedFrom { get; set; }
    public DateTime? CreatedTo { get; set; }
}
