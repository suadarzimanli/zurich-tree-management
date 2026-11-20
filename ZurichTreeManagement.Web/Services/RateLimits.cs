using System.Threading.RateLimiting;
using Microsoft.AspNetCore.RateLimiting;

namespace ZurichTreeManagement.Web.Services;

/// <summary>
/// Per-IP limits for the two endpoints anyone can call without signing in:
/// citizen intake (spam) and sign-in (password guessing).
/// </summary>
public static class RateLimits
{
    public const string CitizenIntake = "citizen-intake";
    public const string SignIn = "sign-in";

    /// <summary>Permits per window come from configuration (RateLimits:CitizenIntakePerWindow /
    /// RateLimits:SignInPerWindow); defaults are strict. Development raises them for local seeding.</summary>
    public static IServiceCollection AddAppRateLimits(this IServiceCollection services, IConfiguration config)
    {
        var intake = Math.Max(1, config.GetValue("RateLimits:CitizenIntakePerWindow", 5));
        var signIn = Math.Max(1, config.GetValue("RateLimits:SignInPerWindow", 10));
        return services.AddRateLimiter(options =>
        {
            options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
            options.AddPolicy(CitizenIntake, ctx => PerIp(ctx, permits: intake, window: TimeSpan.FromMinutes(10)));
            options.AddPolicy(SignIn, ctx => PerIp(ctx, permits: signIn, window: TimeSpan.FromMinutes(5)));
            options.OnRejected = async (ctx, token) =>
            {
                ctx.HttpContext.Response.ContentType = "application/json";
                await ctx.HttpContext.Response.WriteAsync(
                    "{\"success\":false,\"error\":\"Too many requests. Please wait a few minutes and try again.\"}", token);
            };
        });
    }

    private static RateLimitPartition<string> PerIp(HttpContext ctx, int permits, TimeSpan window) =>
        RateLimitPartition.GetFixedWindowLimiter(
            ctx.Connection.RemoteIpAddress?.ToString() ?? "unknown",
            _ => new FixedWindowRateLimiterOptions { PermitLimit = permits, Window = window, QueueLimit = 0 });
}
