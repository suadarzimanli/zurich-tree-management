using Microsoft.AspNetCore.Mvc;
using ZurichTreeManagement.Web.Services;

namespace ZurichTreeManagement.Web.Controllers;

[ApiController]
[Route("api/ogd")]
public sealed class OgdController : ControllerBase
{
    private readonly BaumkatasterWmsService _wms;
    private readonly BaumkatasterWfsService _wfs;

    public OgdController(BaumkatasterWmsService wms, BaumkatasterWfsService wfs)
    {
        _wms = wms;
        _wfs = wfs;
    }

    /// <summary>GET api/ogd/wms-tile?bbox=&amp;width=256&amp;height=256 — EPSG:3857 Baumkataster tile.</summary>
    [HttpGet("wms-tile")]
    [ResponseCache(Duration = 3600, Location = ResponseCacheLocation.Any, VaryByQueryKeys = ["bbox", "width", "height"])]
    public async Task<IActionResult> GetWmsTile(
        [FromQuery] string? bbox,
        [FromQuery] int width = 256,
        [FromQuery] int height = 256,
        CancellationToken cancellationToken = default)
    {
        var (bytes, contentType, fromOgd) = await _wms.GetTileAsync(bbox ?? "", width, height, cancellationToken);
        if (!fromOgd)
            Response.Headers.CacheControl = "no-store, no-cache, max-age=0";
        return File(bytes, contentType);
    }

    /// <summary>GET api/ogd/wms-feature-info — tree attributes at map click (EPSG:3857 tile + pixel).</summary>
    [HttpGet("wms-feature-info")]
    [ResponseCache(Duration = 300, Location = ResponseCacheLocation.Any, VaryByQueryKeys = ["bbox", "width", "height", "i", "j"])]
    public async Task<IActionResult> GetWmsFeatureInfo(
        [FromQuery] string? bbox,
        [FromQuery] int i,
        [FromQuery] int j,
        [FromQuery] int width = 256,
        [FromQuery] int height = 256,
        CancellationToken cancellationToken = default)
    {
        var json = await _wms.GetFeatureInfoJsonAsync(bbox ?? "", width, height, i, j, cancellationToken);
        if (string.IsNullOrWhiteSpace(json))
            return Ok(new { type = "FeatureCollection", features = Array.Empty<object>() });
        return Content(json, "application/json");
    }

    /// <summary>GET api/ogd/trees-near?lat=&amp;lng=&amp;radiusM= — OGD WFS trees within radius (WGS84).</summary>
    [HttpGet("trees-near")]
    [ResponseCache(Duration = 60, Location = ResponseCacheLocation.Any, VaryByQueryKeys = ["lat", "lng", "radiusM"])]
    public async Task<IActionResult> GetTreesNear(
        [FromQuery] double lat,
        [FromQuery] double lng,
        [FromQuery] double radiusM = 5,
        CancellationToken cancellationToken = default)
    {
        var json = await _wfs.FindNearLatLngJsonAsync(lat, lng, radiusM, cancellationToken);
        if (string.IsNullOrWhiteSpace(json))
            return Ok(new { type = "FeatureCollection", features = Array.Empty<object>() });
        return Content(json, "application/json");
    }

    /// <summary>GET api/ogd/tree-by-baumnummer?baumnummer= — OGD WFS tree lookup.</summary>
    [HttpGet("tree-by-baumnummer")]
    [ResponseCache(Duration = 3600, Location = ResponseCacheLocation.Any, VaryByQueryKeys = ["baumnummer"])]
    public async Task<IActionResult> GetTreeByBaumnummer(
        [FromQuery] string? baumnummer,
        CancellationToken cancellationToken = default)
    {
        if (!_wfs.IsValidBaumnummer(baumnummer))
            return BadRequest(new { error = "A valid Baumnummer is required (max 32 characters)." });

        var json = await _wfs.FindByBaumnummerJsonAsync(baumnummer!, cancellationToken);
        if (string.IsNullOrWhiteSpace(json))
            return Ok(new { type = "FeatureCollection", features = Array.Empty<object>() });

        return Content(json, "application/json");
    }
}
