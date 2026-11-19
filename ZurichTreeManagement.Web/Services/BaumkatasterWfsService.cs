using System.Security;
using System.Text.RegularExpressions;
using Microsoft.Extensions.Caching.Memory;

namespace ZurichTreeManagement.Web.Services;

/// <summary>Queries Stadt Zürich OGD Baumkataster WFS (e.g. search by Baumnummer).</summary>
public sealed class BaumkatasterWfsService
{
    private static readonly TimeSpan SearchCacheTtl = TimeSpan.FromHours(1);
    private static readonly Regex BaumnummerPattern = new(@"^[\w\-.]{1,32}$", RegexOptions.CultureInvariant);

    private readonly IHttpClientFactory _httpClientFactory;
    private readonly IConfiguration _configuration;
    private readonly IMemoryCache _cache;
    private readonly ILogger<BaumkatasterWfsService> _logger;

    public BaumkatasterWfsService(
        IHttpClientFactory httpClientFactory,
        IConfiguration configuration,
        IMemoryCache cache,
        ILogger<BaumkatasterWfsService> logger)
    {
        _httpClientFactory = httpClientFactory;
        _configuration = configuration;
        _cache = cache;
        _logger = logger;
    }

    private string WfsBaseUrl =>
        (_configuration["Ogd:WfsUrl"] ?? "https://www.ogd.stadt-zuerich.ch/wfs/geoportal/Baumkataster").Trim();

    private string TypeName =>
        (_configuration["Ogd:WfsTypeName"] ?? "baumkataster_baumstandorte").Trim();

    public bool IsValidBaumnummer(string? baumnummer) =>
        !string.IsNullOrWhiteSpace(baumnummer) && BaumnummerPattern.IsMatch(baumnummer.Trim());

  public async Task<string?> FindNearLatLngJsonAsync(
        double lat,
        double lng,
        double radiusMeters = 5,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(WfsBaseUrl))
            return null;

        if (lat is < -90 or > 90 or double.NaN or double.PositiveInfinity or double.NegativeInfinity)
            return null;
        if (lng is < -180 or > 180 or double.NaN or double.PositiveInfinity or double.NegativeInfinity)
            return null;

        radiusMeters = Math.Clamp(radiusMeters, 1, 50);
        var cacheKey = $"baumkataster-wfs:near:{lat:F5}:{lng:F5}:{radiusMeters:F0}";
        if (_cache.TryGetValue(cacheKey, out string? cached) && !string.IsNullOrWhiteSpace(cached))
            return cached;

        var (easting, northing) = SwissLv95.Wgs84ToLv95(lat, lng);
        var minE = easting - radiusMeters;
        var maxE = easting + radiusMeters;
        var minN = northing - radiusMeters;
        var maxN = northing + radiusMeters;
        var bbox = string.Create(System.Globalization.CultureInfo.InvariantCulture,
            $"{minE},{minN},{maxE},{maxN}");

        var url = WfsBaseUrl
            + "?service=WFS&version=1.1.0&request=GetFeature"
            + "&typeName=" + Uri.EscapeDataString(TypeName)
            + "&maxFeatures=50&outputFormat=application%2Fvnd.geo%2Bjson"
            + "&bbox=" + Uri.EscapeDataString(bbox)
            + ",EPSG:2056";

        try
        {
            var client = _httpClientFactory.CreateClient("ZurichOgd");
            using var response = await client.GetAsync(url, cancellationToken);
            if (!response.IsSuccessStatusCode)
            {
                _logger.LogWarning("OGD Baumkataster WFS near-query returned {StatusCode} for {Lat},{Lng}", response.StatusCode, lat, lng);
                return null;
            }

            var json = await response.Content.ReadAsStringAsync(cancellationToken);
            if (string.IsNullOrWhiteSpace(json) || !json.TrimStart().StartsWith('{'))
                return null;

            _cache.Set(cacheKey, json, new MemoryCacheEntryOptions
            {
                AbsoluteExpirationRelativeToNow = TimeSpan.FromMinutes(15),
                Size = Math.Min(json.Length, 64 * 1024)
            });
            return json;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "OGD Baumkataster WFS near-query failed for {Lat},{Lng}", lat, lng);
            return null;
        }
    }

    public async Task<string?> FindByBaumnummerJsonAsync(string baumnummer, CancellationToken cancellationToken = default)
    {
        var id = (baumnummer ?? "").Trim();
        if (!IsValidBaumnummer(id))
            return null;

        if (string.IsNullOrWhiteSpace(WfsBaseUrl))
            return null;

        var cacheKey = $"baumkataster-wfs:baum:{id.ToUpperInvariant()}";
        if (_cache.TryGetValue(cacheKey, out string? cached) && !string.IsNullOrWhiteSpace(cached))
            return cached;

        var escaped = SecurityElement.Escape(id) ?? id;
        var filterXml =
            "<Filter><PropertyIsEqualTo><PropertyName>baumnummer</PropertyName>"
            + "<Literal>" + escaped + "</Literal></PropertyIsEqualTo></Filter>";
        var filter = Uri.EscapeDataString(filterXml);

        var url = WfsBaseUrl
            + "?service=WFS&version=1.1.0&request=GetFeature"
            + "&typeName=" + Uri.EscapeDataString(TypeName)
            + "&maxFeatures=5&outputFormat=application%2Fvnd.geo%2Bjson"
            + "&filter=" + filter;

        try
        {
            var client = _httpClientFactory.CreateClient("ZurichOgd");
            using var response = await client.GetAsync(url, cancellationToken);
            if (!response.IsSuccessStatusCode)
            {
                _logger.LogWarning("OGD Baumkataster WFS returned {StatusCode} for baumnummer {Baumnummer}", response.StatusCode, id);
                return null;
            }

            var json = await response.Content.ReadAsStringAsync(cancellationToken);
            if (string.IsNullOrWhiteSpace(json) || !json.TrimStart().StartsWith('{'))
                return null;

            _cache.Set(cacheKey, json, new MemoryCacheEntryOptions
            {
                AbsoluteExpirationRelativeToNow = SearchCacheTtl,
                Size = Math.Min(json.Length, 64 * 1024)
            });
            return json;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "OGD Baumkataster WFS search failed for baumnummer {Baumnummer}", id);
            return null;
        }
    }
}
