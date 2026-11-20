using System.Security.Claims;
using Microsoft.AspNetCore.Mvc.RazorPages;

namespace ZurichTreeManagement.Web.Pages;

public class IndexModel : PageModel
{
    private readonly IConfiguration _configuration;

    public IndexModel(IConfiguration configuration) => _configuration = configuration;

    public bool HasGoogleMapsKey { get; private set; }
    public string? GoogleMapsScriptUrl { get; private set; }
    public double CenterLat { get; private set; }
    public double CenterLng { get; private set; }
    public int InitialZoom { get; private set; }
    public int MinTreeLayerZoom { get; private set; }
    public int MinTreeClickZoom { get; private set; }
    public int MinSrZoom { get; private set; }
    public int MaskBufferFeet { get; private set; }
    public string WmsTilePath { get; private set; } = "/api/ogd/wms-tile";
    public string WmsFeatureInfoPath { get; private set; } = "/api/ogd/wms-feature-info";
    public string TreeSearchPath { get; private set; } = "/api/ogd/tree-by-baumnummer";
    public string TreesNearPath { get; private set; } = "/api/ogd/trees-near";
    public int MapPickRadiusM { get; private set; } = 10;
    public string CityBoundaryPath { get; private set; } = "/data/zurich-city-boundary-wgs84.geojson";
    public string SrCreatePath { get; private set; } = "/api/sr/create-from-map";
    public string SrGetPath { get; private set; } = "/api/sr/{srNumber}";
    public string InspectionCreatePath { get; private set; } = "/api/inspection/create-for-sr/{srNumber}";
    public string InspectionUpdatePath { get; private set; } = "/api/inspection/{inspectionId}";
    public string WorkOrderUpdatePath { get; private set; } = "/api/workorder/{workOrderId}";
    public string MapMarkersPath { get; private set; } = "/api/map/markers";
    public string LoginPath { get; private set; } = "/Account/Login";
    public string LogoutPath { get; private set; } = "/Account/Logout";
    public bool IsAuthenticated { get; private set; }
    public string UserDisplayName { get; private set; } = "";
    public string UserRole { get; private set; } = "";

    public void OnGet()
    {
        IsAuthenticated = User?.Identity?.IsAuthenticated == true;
        UserDisplayName = User?.FindFirstValue(ClaimTypes.GivenName)
            ?? User?.Identity?.Name
            ?? "";
        UserRole = User?.FindFirstValue(ClaimTypes.Role) ?? "";

        CenterLat = _configuration.GetValue("Map:CenterLat", 47.3769);
        CenterLng = _configuration.GetValue("Map:CenterLng", 8.5417);
        InitialZoom = _configuration.GetValue("Map:InitialZoom", 15);
        MinTreeLayerZoom = _configuration.GetValue("Map:MinTreeLayerZoom", _configuration.GetValue("Map:MinTreeZoom", 13));
        MinTreeClickZoom = _configuration.GetValue("Map:MinTreeClickZoom", 19);
        MinSrZoom = _configuration.GetValue("Map:MinSrZoom", 19);
        MaskBufferFeet = _configuration.GetValue("Map:MaskBufferFeet", 400);
        MapPickRadiusM = _configuration.GetValue("Map:PickRadiusM", 10);

        var apiKey = (_configuration["GoogleMaps:ApiKey"] ?? _configuration["AppSettings:GoogleMapsApiKey"] ?? "").Trim();
        HasGoogleMapsKey = apiKey.Length > 0;
        if (HasGoogleMapsKey)
        {
            GoogleMapsScriptUrl =
                "https://maps.googleapis.com/maps/api/js?key="
                + Uri.EscapeDataString(apiKey)
                + "&loading=async&libraries=places,geometry&callback=initZurichMap";
        }
    }
}
