using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.StaticFiles;
using Microsoft.EntityFrameworkCore;
using ZurichTreeManagement.Web.Data;
using ZurichTreeManagement.Web.Services;

var builder = WebApplication.CreateBuilder(args);
builder.Configuration.AddJsonFile(
    $"appsettings.{builder.Environment.EnvironmentName}.local.json",
    optional: true,
    reloadOnChange: true);

builder.Services.Configure<DemoAuthOptions>(builder.Configuration.GetSection(DemoAuthOptions.SectionName));
builder.Services.AddSingleton<DemoAuthService>();

builder.Services.AddRazorPages();
builder.Services.AddControllers()
    .ConfigureApiBehaviorOptions(options => options.SuppressModelStateInvalidFilter = true);
builder.Services.AddResponseCaching();
builder.Services.AddMemoryCache(options => options.SizeLimit = 256 * 1024 * 1024);

builder.Services.AddAuthentication(CookieAuthenticationDefaults.AuthenticationScheme)
    .AddCookie(CookieAuthenticationDefaults.AuthenticationScheme, options =>
    {
        options.LoginPath = "/Account/Login";
        options.LogoutPath = "/Account/Logout";
        options.AccessDeniedPath = "/Account/Login";
    });

builder.Services.AddAuthorization();
builder.Services.AddAppRateLimits(builder.Configuration);

builder.Services.AddHttpClient("ZurichOgd", client =>
{
    client.Timeout = TimeSpan.FromSeconds(45);
    client.DefaultRequestHeaders.UserAgent.ParseAdd("ZurichTreeManagement/1.0");
});

builder.Services.AddSingleton<BaumkatasterWmsService>();
builder.Services.AddSingleton<BaumkatasterWfsService>();

var connectionString = builder.Configuration.GetConnectionString("TreeManagementZurich")
    ?? "Server=localhost\\MSSQLSERVER01;Database=TreeManagementZurich;Trusted_Connection=True;TrustServerCertificate=True";

builder.Services.AddDbContext<ZurichDbContext>(options =>
    options.UseSqlServer(connectionString));

builder.Services.AddScoped<WorkflowService>();
builder.Services.AddScoped<ActivityService>();

var app = builder.Build();

if (!app.Environment.IsDevelopment())
{
    app.UseExceptionHandler("/Error");
    app.UseHsts();
}

app.UseHttpsRedirection();

var staticContentTypes = new FileExtensionContentTypeProvider();
staticContentTypes.Mappings[".geojson"] = "application/geo+json";
app.UseStaticFiles(new StaticFileOptions { ContentTypeProvider = staticContentTypes });

app.UseResponseCaching();
app.UseRouting();
app.UseAuthentication();
app.UseAuthorization();
app.UseRateLimiter();
app.MapRazorPages();
app.MapControllers();

app.Run();

/// <summary>Exposed for integration tests (WebApplicationFactory).</summary>
public partial class Program { }
