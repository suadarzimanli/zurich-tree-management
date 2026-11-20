using Microsoft.Extensions.Options;
using ZurichTreeManagement.Web.Services;

namespace ZurichTreeManagement.Tests;

public class DemoAuthTests
{
    private static DemoAuthService Service(DemoAuthOptions o) => new(Options.Create(o));

    [Fact]
    public void Demo_sign_in_is_off_and_has_no_accounts_unless_configured()
    {
        var defaults = new DemoAuthOptions();
        Assert.False(defaults.Enabled);
        Assert.Empty(defaults.Users);
    }

    [Fact]
    public void Disabled_demo_sign_in_rejects_even_correct_credentials()
    {
        var o = new DemoAuthOptions { Enabled = false, Users = { new DemoAuthUser { Login = "admin", Password = "pw" } } };
        Assert.Null(Service(o).Validate("admin", "pw"));
    }

    [Fact]
    public void Enabled_demo_sign_in_checks_the_password()
    {
        var o = new DemoAuthOptions { Enabled = true, Users = { new DemoAuthUser { Login = "admin", Password = "pw" } } };
        Assert.NotNull(Service(o).Validate("ADMIN", "pw"));
        Assert.Null(Service(o).Validate("admin", "PW"));
        Assert.Null(Service(o).Validate("admin", ""));
    }
}
