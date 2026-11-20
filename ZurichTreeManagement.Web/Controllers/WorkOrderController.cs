using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using ZurichTreeManagement.Web.Models;
using ZurichTreeManagement.Web.Services;

namespace ZurichTreeManagement.Web.Controllers;

[ApiController]
[Route("api/workorder")]
public sealed class WorkOrderController : ControllerBase
{
    private readonly WorkflowService _workflow;

    public WorkOrderController(WorkflowService workflow) => _workflow = workflow;

    [HttpGet("by-sr/{srNumber:long}")]
    public async Task<ActionResult<WorkOrderDto>> GetBySr(long srNumber, CancellationToken cancellationToken)
    {
        var workOrder = await _workflow.GetWorkOrderBySrAsync(srNumber, cancellationToken);
        return workOrder is null ? NotFound() : Ok(PublicRedaction.Apply(workOrder, User));
    }

    [Authorize]
    [HttpPut("{workOrderId:long}")]
    public async Task<ActionResult<object>> Update(
        long workOrderId,
        [FromBody] UpdateWorkOrderRequest request,
        CancellationToken cancellationToken)
    {
        if (!ModelState.IsValid)
            return BadRequest(new { success = false, error = "Invalid request." });

        var (success, error, workOrder) =
            await _workflow.ResolveWorkOrderAsync(workOrderId, request, cancellationToken);

        if (!success)
            return BadRequest(new { success = false, error });

        return Ok(new { success = true, workOrder });
    }
}
