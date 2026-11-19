namespace ZurichTreeManagement.Web.Services;

/// <summary>Approximate WGS84 ↔ LV95 (EPSG:2056) for OGD Baumkataster WFS bbox queries.</summary>
internal static class SwissLv95
{
    public static (double Easting, double Northing) Wgs84ToLv95(double lat, double lng)
    {
        var latAux = (lat * 3600 - 169028.66) / 10000d;
        var lonAux = (lng * 3600 - 26782.5) / 10000d;
        var easting = 2600072.37
            + 211455.93 * lonAux
            - 10938.51 * lonAux * latAux
            - 0.36 * lonAux * latAux * latAux
            - 44.54 * lonAux * lonAux * lonAux;
        var northing = 1200147.07
            + 308807.95 * latAux
            + 3745.25 * lonAux * lonAux
            + 76.63 * latAux * latAux
            - 194.56 * lonAux * lonAux * latAux
            + 119.79 * latAux * latAux * latAux;
        return (easting, northing);
    }
}
