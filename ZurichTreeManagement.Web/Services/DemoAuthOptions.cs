namespace ZurichTreeManagement.Web.Services;

public sealed class DemoAuthOptions
{
    public const string SectionName = "DemoAuth";

    /// <summary>Off unless configuration turns it on (appsettings.Development.json does).</summary>
    public bool Enabled { get; set; }

    /// <summary>Demo accounts come from configuration only (a non-empty default list would be
    /// merged with the configured one and duplicate every user).</summary>
    public List<DemoAuthUser> Users { get; set; } = new();
}

public sealed class DemoAuthUser
{
    public string Login { get; set; } = "";
    public string Password { get; set; } = "";
    public string DisplayName { get; set; } = "";
    public string Role { get; set; } = "User";
}
