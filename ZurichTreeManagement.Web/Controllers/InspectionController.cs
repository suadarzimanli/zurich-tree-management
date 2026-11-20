using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using ZurichTreeManagement.Web.Models;
using ZurichTreeManagement.Web.Services;

namespace ZurichTreeManagement.Web.Controllers;

[ApiController]
[Route("api/inspection")]
public sealed class InspectionController : ControllerBase
{
    private readonly WorkflowService _workflow;

    public InspectionController(WorkflowService workflow) => _workflow = workflow;

    [HttpGet("by-sr/{srNumber:long}")]
    public async Task<ActionResult<InspectionDto>> GetBySr(long srNumber, CancellationToken cancellationToken)
    {
        var inspection = await _workflow.GetInspectionBySrAsync(srNumber, cancellationToken);
        return inspection is null ? NotFound() : Ok(PublicRedaction.Apply(inspection, User));
    }

    [Authorize]
    [HttpPost("create-for-sr/{srNumber:long}")]
    public async Task<ActionResult<object>> CreateForSr(long srNumber, CancellationToken cancellationToken)
    {
        var (success, error, inspection) =
            await _workflow.CreateInspectionForSrAsync(srNumber, cancellationToken);

        if (!success)
            return BadRequest(new { success = false, error, inspection });

        return Ok(new { success = true, inspection });
    }

    [Authorize]
    [HttpPut("{inspectionId:long}")]
    public async Task<ActionResult<object>> Update(
        long inspectionId,
        [FromBody] UpdateInspectionRequest request,
        CancellationToken cancellationToken)
    {
        if (!ModelState.IsValid)
            return BadRequest(new { success = false, error = "Invalid request." });

        var (success, error, inspection, workOrder) =
            await _workflow.UpdateInspectionAsync(inspectionId, request, cancellationToken);

        if (!success)
            return BadRequest(new { success = false, error });

        return Ok(new { success = true, inspection, workOrder });
    }
}
