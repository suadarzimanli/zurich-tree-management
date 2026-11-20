namespace ZurichTreeManagement.Web.Models;

public sealed class SrListFilter
{
    public string? Status { get; set; }
    public string? Phase { get; set; }
    public string? SubArea { get; set; }
    public string? Priority { get; set; }
    public string? AssignedTo { get; set; }
    public string? Search { get; set; }
    public DateTime? CreatedFrom { get; set; }
    public DateTime? CreatedTo { get; set; }
    /// <summary>Search contact name/e-mail too (staff only — otherwise the search reveals who filed).</summary>
    public bool IncludeContactSearch { get; set; }
}
