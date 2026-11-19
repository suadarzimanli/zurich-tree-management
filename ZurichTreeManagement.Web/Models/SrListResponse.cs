namespace ZurichTreeManagement.Web.Models;

public sealed class SrListResponse
{
    public IReadOnlyList<SrListItemDto> Items { get; set; } = Array.Empty<SrListItemDto>();
    public int Total { get; set; }
}
