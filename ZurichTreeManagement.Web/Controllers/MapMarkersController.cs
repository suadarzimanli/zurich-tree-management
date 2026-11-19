using Microsoft.AspNetCore.Mvc;
using ZurichTreeManagement.Web.Models;
using ZurichTreeManagement.Web.Services;

namespace ZurichTreeManagement.Web.Controllers;

[ApiController]
[Route("api/map")]
public sealed class MapMarkersController : ControllerBase
{
    private readonly WorkflowService _workflow;

    public MapMarkersController(WorkflowService workflow) => _workflow = workflow;

    [HttpGet("markers")]
    public async Task<IActionResult> GetMarkers(
        [FromQuery] string? status,
        [FromQuery] string? phase,
        [FromQuery] string? subArea,
        [FromQuery] string? priority,
        [FromQuery] DateTime? createdFrom,
        [FromQuery] DateTime? createdTo,
        CancellationToken cancellationToken)
    {
        var filter = new MapMarkerFilter
        {
            Status = status,
            Phase = phase,
            SubArea = subArea,
            Priority = priority,
            CreatedFrom = createdFrom,
            CreatedTo = createdTo
        };

        var markers = await _workflow.GetMapMarkersAsync(filter, cancellationToken);
        return Ok(new { markers });
    }
}
