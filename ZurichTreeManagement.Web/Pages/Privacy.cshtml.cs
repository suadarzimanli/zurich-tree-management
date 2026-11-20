using Microsoft.AspNetCore.Mvc.RazorPages;

namespace ZurichTreeManagement.Web.Pages;

public class PrivacyModel : PageModel
{
    public string Culture { get; private set; } = "en";
    public bool IsGerman => Culture.StartsWith("de", StringComparison.OrdinalIgnoreCase);

    public void OnGet()
    {
        Culture = Request.Cookies["ZurichCulture"] ?? "en";
    }
}
