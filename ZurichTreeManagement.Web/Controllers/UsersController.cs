using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using ZurichTreeManagement.Web.Models;
using ZurichTreeManagement.Web.Services;

namespace ZurichTreeManagement.Web.Controllers;

[ApiController]
[Route("api/users")]
public sealed class UsersController : ControllerBase
{
    private static readonly string[] ForestryTeam =
    [
        "Forestry clerk",
        "Field inspector",
        "Operations",
        "Contractor",
        "Duty officer"
    ];

    private readonly DemoAuthOptions _options;

    public UsersController(IOptions<DemoAuthOptions> options) => _options = options.Value;

    [HttpGet("assignees")]
    public ActionResult<IReadOnlyList<AssigneeDto>> GetAssignees()
    {
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var list = new List<AssigneeDto>();

        void Add(string name, string? role)
        {
            var trimmed = name.Trim();
            if (string.IsNullOrEmpty(trimmed) || !seen.Add(trimmed)) return;
            list.Add(new AssigneeDto { Name = trimmed, Role = role });
        }

        if (_options.Enabled)
        {
            foreach (var user in _options.Users)
                Add(user.DisplayName, user.Role);
        }

        foreach (var name in ForestryTeam)
            Add(name, "Forestry team");

        return Ok(list.OrderBy(a => a.Name, StringComparer.OrdinalIgnoreCase).ToList());
    }
}
