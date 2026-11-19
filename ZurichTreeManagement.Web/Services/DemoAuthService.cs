using System.Security.Claims;
using Microsoft.Extensions.Options;

namespace ZurichTreeManagement.Web.Services;

public sealed class DemoAuthService
{
    private readonly DemoAuthOptions _options;

    public DemoAuthService(IOptions<DemoAuthOptions> options) => _options = options.Value;

    public DemoAuthUser? Validate(string? login, string? password)
    {
        if (!_options.Enabled) return null;

        var key = (login ?? "").Trim();
        var pwd = password ?? "";
        if (string.IsNullOrEmpty(key) || string.IsNullOrEmpty(pwd)) return null;

        return _options.Users.FirstOrDefault(u =>
            string.Equals(u.Login, key, StringComparison.OrdinalIgnoreCase)
            && u.Password == pwd);
    }

    public static ClaimsPrincipal CreatePrincipal(DemoAuthUser user)
    {
        var claims = new List<Claim>
        {
            new(ClaimTypes.Name, user.Login),
            new(ClaimTypes.GivenName, user.DisplayName),
            new(ClaimTypes.Role, user.Role)
        };

        var identity = new ClaimsIdentity(claims, "DemoCookie");
        return new ClaimsPrincipal(identity);
    }
}
