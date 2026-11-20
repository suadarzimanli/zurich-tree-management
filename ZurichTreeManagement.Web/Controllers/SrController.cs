using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using ZurichTreeManagement.Web.Models;
using ZurichTreeManagement.Web.Services;

namespace ZurichTreeManagement.Web.Controllers;

[ApiController]
[Route("api/sr")]
public sealed class SrController : ControllerBase
{
    private readonly WorkflowService _workflow;

    public SrController(WorkflowService workflow) => _workflow = workflow;

    [HttpGet]
    public async Task<ActionResult<SrListResponse>> List(
        [FromQuery] string? status,
        [FromQuery] string? phase,
        [FromQuery] string? subArea,
        [FromQuery] string? priority,
        [FromQuery] string? assignedTo,
        [FromQuery] string? search,
        [FromQuery] DateTime? createdFrom,
        [FromQuery] DateTime? createdTo,
        CancellationToken cancellationToken)
    {
        var filter = new SrListFilter
        {
            Status = status,
            Phase = phase,
            SubArea = subArea,
            Priority = priority,
            AssignedTo = assignedTo,
            Search = search,
            CreatedFrom = createdFrom,
            CreatedTo = createdTo,
            IncludeContactSearch = PublicRedaction.IsStaff(User)
        };

        var result = await _workflow.GetSrListAsync(filter, cancellationToken);
        return Ok(PublicRedaction.Apply(result, User));
    }

    [HttpPost("create-from-map")]
    [EnableRateLimiting(RateLimits.CitizenIntake)]
    public async Task<ActionResult<CreateSrResponse>> CreateFromMap(
        [FromBody] CreateSrRequest request,
        CancellationToken cancellationToken)
    {
        if (!ModelState.IsValid)
        {
            var error = ModelState.Values
                .SelectMany(v => v.Errors)
                .Select(e => e.ErrorMessage)
                .FirstOrDefault() ?? "Invalid request.";
            return BadRequest(new CreateSrResponse { Success = false, Error = error });
        }

        if (string.IsNullOrWhiteSpace(request.LinkedTreeBaumnummer))
            return BadRequest(new CreateSrResponse { Success = false, Error = "Linked Tree (Baumnummer) is required." });

        // Never trust the browser: the location must be in Zürich and the type must be one we offer.
        if (!ZurichArea.Contains(request.Lat, request.Lng))
            return BadRequest(new CreateSrResponse { Success = false, Error = "The location must be inside the City of Zürich." });

        if (!ZurichRequestTopics.IsKnown(request.RequestType))
            return BadRequest(new CreateSrResponse { Success = false, Error = "Unknown request type." });

        var response = await _workflow.CreateFromMapAsync(request, cancellationToken);
        return response.Success ? Ok(response) : BadRequest(response);
    }

    [HttpGet("{srNumber:long}")]
    public async Task<ActionResult<SrDetailDto>> Get(long srNumber, CancellationToken cancellationToken)
    {
        var record = await _workflow.GetSrAsync(srNumber, cancellationToken);
        return record is null ? NotFound() : Ok(PublicRedaction.Apply(record, User));
    }

    [Authorize]
    [HttpPut("{srNumber:long}")]
    public async Task<ActionResult<SrDetailDto>> Update(
        long srNumber,
        [FromBody] UpdateSrRequest request,
        CancellationToken cancellationToken)
    {
        var (success, error, detail) = await _workflow.UpdateSrAsync(srNumber, request, cancellationToken);
        if (!success)
            return BadRequest(new { error });
        return Ok(detail);
    }
}
