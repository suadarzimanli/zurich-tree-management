namespace ZurichTreeManagement.Web.Services;

public sealed class DemoAuthOptions
{
    public const string SectionName = "DemoAuth";

    public bool Enabled { get; set; } = true;

    public List<DemoAuthUser> Users { get; set; } = new()
    {
        new DemoAuthUser { Login = "admin", Password = "Demo2024!", DisplayName = "Administrator", Role = "Admin" },
        new DemoAuthUser { Login = "user", Password = "Demo2024!", DisplayName = "Field User", Role = "User" }
    };
}

public sealed class DemoAuthUser
{
    public string Login { get; set; } = "";
    public string Password { get; set; } = "";
    public string DisplayName { get; set; } = "";
    public string Role { get; set; } = "User";
}
