namespace ZurichTreeManagement.Web.Services;

/// <summary>
/// Generous bounding box around the City of Zürich (WGS84). Used to reject
/// citizen requests whose coordinates cannot belong to a Zürich street tree.
/// </summary>
public static class ZurichArea
{
    public const double MinLat = 47.30, MaxLat = 47.45, MinLng = 8.43, MaxLng = 8.64;

    public static bool Contains(double lat, double lng) =>
        double.IsFinite(lat) && double.IsFinite(lng)
        && lat >= MinLat && lat <= MaxLat && lng >= MinLng && lng <= MaxLng;
}
