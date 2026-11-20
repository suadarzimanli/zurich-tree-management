using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Mvc.Testing;

namespace ZurichTreeManagement.Tests;

/// <summary>
/// In-process API tests. Every request here is rejected before the database is
/// touched, so they run without SQL Server (e.g. in CI).
/// </summary>
public class CitizenIntakeApiTests : IClassFixture<WebApplicationFactory<Program>>
{
    private readonly WebApplicationFactory<Program> _factory;
    public CitizenIntakeApiTests(WebApplicationFactory<Program> factory) => _factory = factory;

    private static object Request(double lat, double lng, string type = "Tree planting request") => new
    {
        lat, lng, address = "Bahnhofstrasse 1", firstName = "Anna", lastName = "Muster",
        email = "anna@example.ch", requestType = type, linkedTreeBaumnummer = "1234"
    };

    [Fact]
    public async Task Location_outside_Zurich_is_rejected()
    {
        var res = await _factory.CreateClient().PostAsJsonAsync("/api/sr/create-from-map", Request(46.948, 7.447));
        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
        Assert.Contains("inside the City of Z", await res.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Unknown_request_type_is_rejected()
    {
        var res = await _factory.CreateClient().PostAsJsonAsync("/api/sr/create-from-map", Request(47.377, 8.542, "anything"));
        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
    }

    [Fact]
    public async Task Anonymous_intake_is_rate_limited_per_address()
    {
        // Fresh factory so other tests do not share the limiter window.
        using var factory = new WebApplicationFactory<Program>();
        var client = factory.CreateClient();
        HttpStatusCode last = HttpStatusCode.OK;
        for (var i = 0; i < 7; i++)
            last = (await client.PostAsJsonAsync("/api/sr/create-from-map", Request(46.948, 7.447))).StatusCode;
        Assert.Equal(HttpStatusCode.TooManyRequests, last);
    }

    [Fact]
    public async Task Editing_requires_sign_in()
    {
        var res = await _factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false })
            .PutAsJsonAsync("/api/sr/10001", new { });
        Assert.True(res.StatusCode is HttpStatusCode.Unauthorized or HttpStatusCode.Redirect or HttpStatusCode.Found,
            $"expected sign-in challenge, got {res.StatusCode}");
    }
}
