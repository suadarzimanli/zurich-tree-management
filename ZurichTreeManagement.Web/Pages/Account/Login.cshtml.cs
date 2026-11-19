using System.ComponentModel.DataAnnotations;
using System.Security.Claims;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.RazorPages;
using Microsoft.Extensions.Options;
using ZurichTreeManagement.Web.Services;

namespace ZurichTreeManagement.Web.Pages.Account;

public sealed class LoginModel : PageModel
{
    private readonly DemoAuthService _auth;
    private readonly DemoAuthOptions _options;

    public LoginModel(DemoAuthService auth, IOptions<DemoAuthOptions> options)
    {
        _auth = auth;
        _options = options.Value;
    }

    [BindProperty]
    public InputModel Input { get; set; } = new();

    public string? ReturnUrl { get; set; }

    public bool DemoEnabled => _options.Enabled;

    public IReadOnlyList<DemoAuthUser> DemoUsers => _options.Users;

    public sealed class InputModel
    {
        [Required]
        [Display(Name = "Login name")]
        public string Login { get; set; } = "";

        [Required]
        [DataType(DataType.Password)]
        public string Password { get; set; } = "";
    }

    public void OnGet(string? returnUrl = null)
    {
        ReturnUrl = string.IsNullOrWhiteSpace(returnUrl) ? "/" : returnUrl;
    }

    public async Task<IActionResult> OnPostAsync(string? returnUrl = null)
    {
        ReturnUrl = string.IsNullOrWhiteSpace(returnUrl) ? "/" : returnUrl;

        if (!ModelState.IsValid)
            return Page();

        var user = _auth.Validate(Input.Login, Input.Password);
        if (user is null)
        {
            ModelState.AddModelError(string.Empty, "Invalid login name or password.");
            return Page();
        }

        var principal = DemoAuthService.CreatePrincipal(user);
        await HttpContext.SignInAsync(
            CookieAuthenticationDefaults.AuthenticationScheme,
            principal,
            new AuthenticationProperties
            {
                IsPersistent = true,
                ExpiresUtc = DateTimeOffset.UtcNow.AddHours(8)
            });

        return LocalRedirect(ReturnUrl);
    }
}
