using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using ZurichTreeManagement.Web.Models;
using ZurichTreeManagement.Web.Services;

namespace ZurichTreeManagement.Web.Controllers;

[ApiController]
[Route("api/activities")]
public sealed class ActivityController : ControllerBase
{
    private readonly ActivityService _activities;

    public ActivityController(ActivityService activities) => _activities = activities;

    [HttpGet("sr/{srNumber:long}")]
    public async Task<ActionResult<object>> GetForSr(long srNumber, CancellationToken cancellationToken)
    {
        var list = await _activities.GetActivitiesAsync(srNumber, cancellationToken);
        var plan = await _activities.GetPlanProgressAsync(srNumber, cancellationToken);
        return Ok(new { activities = list, plan });
    }

    [Authorize]
    [HttpPost("sr/{srNumber:long}")]
    public async Task<ActionResult<ActivityDto>> Create(
        long srNumber,
        [FromBody] CreateActivityRequest request,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(request.Subject))
            return BadRequest(new { error = "Subject is required." });

        var user = User.FindFirstValue(ClaimTypes.GivenName) ?? User.Identity?.Name;
        var (success, error, activity) = await _activities.CreateManualActivityAsync(
            srNumber, request, user, cancellationToken);

        if (!success)
            return BadRequest(new { error });

        return Ok(activity);
    }

    [Authorize]
    [HttpPut("{activityId:long}")]
    public async Task<ActionResult<ActivityDto>> Update(
        long activityId,
        [FromBody] UpdateActivityRequest request,
        CancellationToken cancellationToken)
    {
        var (success, error, activity) = await _activities.UpdateActivityAsync(
            activityId, request, cancellationToken);

        if (!success)
            return BadRequest(new { error });

        return Ok(activity);
    }
}
