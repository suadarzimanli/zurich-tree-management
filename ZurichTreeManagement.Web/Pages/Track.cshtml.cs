using Microsoft.AspNetCore.Mvc.RazorPages;

namespace ZurichTreeManagement.Web.Pages;

/// <summary>Public, privacy-safe status page: follow a request by its reference number.</summary>
public sealed class TrackModel : PageModel
{
    public string Culture { get; private set; } = "en";
    public bool IsGerman => Culture.StartsWith("de", StringComparison.OrdinalIgnoreCase);
    public long? SrNumber { get; private set; }

    public void OnGet(long? sr)
    {
        Culture = Request.Cookies["ZurichCulture"] ?? "en";
        SrNumber = sr is > 0 ? sr : null;
    }
}
