using System.Globalization;
using Microsoft.Extensions.Caching.Memory;

namespace ZurichTreeManagement.Web.Services;

/// <summary>Proxies Stadt Zürich OGD Baumkataster WMS map tiles.</summary>
public sealed class BaumkatasterWmsService
{
    private static readonly TimeSpan TileCacheTtl = TimeSpan.FromHours(6);
    private const int MaxConcurrentOgdRequests = 8;

    private static readonly byte[] TransparentPng =
        Convert.FromBase64String("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=");

    private static readonly SemaphoreSlim OgdGate = new(MaxConcurrentOgdRequests, MaxConcurrentOgdRequests);

    private readonly IHttpClientFactory _httpClientFactory;
    private readonly IConfiguration _configuration;
    private readonly IMemoryCache _cache;
    private readonly ILogger<BaumkatasterWmsService> _logger;

    public BaumkatasterWmsService(
        IHttpClientFactory httpClientFactory,
        IConfiguration configuration,
        IMemoryCache cache,
        ILogger<BaumkatasterWmsService> logger)
    {
        _httpClientFactory = httpClientFactory;
        _configuration = configuration;
        _cache = cache;
        _logger = logger;
    }

    private string WmsBaseUrl => (_configuration["Ogd:WmsUrl"] ?? "").Trim();
    private string WmsLayer => (_configuration["Ogd:WmsLayer"] ?? "Baumstandorte").Trim();

    public async Task<(byte[] Bytes, string ContentType, bool FromOgd)> GetTileAsync(
        string bbox,
        int width,
        int height,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(WmsBaseUrl) || !TryParseBbox3857(bbox, out _))
            return (TransparentPng, "image/png", false);

        width = Math.Clamp(width, 64, 512);
        height = Math.Clamp(height, 64, 512);

        var cacheKey = $"baumkataster-tile:{WmsLayer}:{bbox}:{width}x{height}";
        if (_cache.TryGetValue(cacheKey, out byte[]? cached) && cached is { Length: > 200 })
            return (cached, "image/png", true);

        var bytes = await FetchTileFromOgdAsync(bbox, width, height, cancellationToken);
        if (bytes is { Length: > 200 } && IsPng(bytes))
        {
            _cache.Set(cacheKey, bytes, new MemoryCacheEntryOptions
            {
                AbsoluteExpirationRelativeToNow = TileCacheTtl,
                Size = bytes.Length
            });
            return (bytes, "image/png", true);
        }

        _logger.LogWarning("Baumkataster WMS tile unavailable for bbox {Bbox}", bbox);
        return (TransparentPng, "image/png", false);
    }

    public async Task<string?> GetFeatureInfoJsonAsync(
        string bbox,
        int width,
        int height,
        int i,
        int j,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(WmsBaseUrl) || !TryParseBbox3857(bbox, out _))
            return null;

        width = Math.Clamp(width, 64, 512);
        height = Math.Clamp(height, 64, 512);
        i = Math.Clamp(i, 0, width - 1);
        j = Math.Clamp(j, 0, height - 1);

        var url = WmsBaseUrl
            + "?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetFeatureInfo"
            + "&LAYERS=" + Uri.EscapeDataString(WmsLayer)
            + "&QUERY_LAYERS=" + Uri.EscapeDataString(WmsLayer)
            + "&CRS=EPSG:3857"
            + "&BBOX=" + Uri.EscapeDataString(bbox)
            + "&WIDTH=" + width.ToString(CultureInfo.InvariantCulture)
            + "&HEIGHT=" + height.ToString(CultureInfo.InvariantCulture)
            + "&I=" + i.ToString(CultureInfo.InvariantCulture)
            + "&J=" + j.ToString(CultureInfo.InvariantCulture)
            + "&INFO_FORMAT=application%2Fjson&FEATURE_COUNT=5";

        await OgdGate.WaitAsync(cancellationToken);
        try
        {
            for (var attempt = 1; attempt <= 2; attempt++)
            {
                try
                {
                    var client = _httpClientFactory.CreateClient("ZurichOgd");
                    using var response = await client.GetAsync(url, cancellationToken);
                    if (!response.IsSuccessStatusCode)
                        continue;
                    var json = await response.Content.ReadAsStringAsync(cancellationToken);
                    if (!string.IsNullOrWhiteSpace(json) && json.TrimStart().StartsWith('{'))
                        return json;
                }
                catch (Exception ex) when (attempt < 2 && !cancellationToken.IsCancellationRequested)
                {
                    _logger.LogWarning(ex, "OGD WMS GetFeatureInfo attempt {Attempt}/2 failed.", attempt);
                    await Task.Delay(120 * attempt, cancellationToken);
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "OGD WMS GetFeatureInfo failed.");
                    break;
                }
            }
        }
        finally
        {
            OgdGate.Release();
        }

        return null;
    }

    private async Task<byte[]?> FetchTileFromOgdAsync(
        string bbox,
        int width,
        int height,
        CancellationToken cancellationToken)
    {
        var url = WmsBaseUrl
            + "?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap"
            + "&LAYERS=" + Uri.EscapeDataString(WmsLayer)
            + "&CRS=EPSG:3857"
            + "&BBOX=" + Uri.EscapeDataString(bbox)
            + "&WIDTH=" + width.ToString(CultureInfo.InvariantCulture)
            + "&HEIGHT=" + height.ToString(CultureInfo.InvariantCulture)
            + "&FORMAT=image/png&TRANSPARENT=TRUE&STYLES=";

        await OgdGate.WaitAsync(cancellationToken);
        try
        {
            for (var attempt = 1; attempt <= 3; attempt++)
            {
                try
                {
                    var client = _httpClientFactory.CreateClient("ZurichOgd");
                    using var response = await client.GetAsync(url, cancellationToken);
                    var bytes = await response.Content.ReadAsByteArrayAsync(cancellationToken);
                    if (response.IsSuccessStatusCode && IsPng(bytes))
                        return bytes;
                }
                catch (Exception ex) when (attempt < 3 && !cancellationToken.IsCancellationRequested)
                {
                    _logger.LogWarning(ex, "OGD WMS fetch attempt {Attempt}/3 failed.", attempt);
                    await Task.Delay(150 * attempt, cancellationToken);
                }
            }
        }
        finally
        {
            OgdGate.Release();
        }

        return null;
    }

    private static bool IsPng(byte[] bytes) =>
        bytes.Length >= 8 && bytes[0] == 0x89 && bytes[1] == 0x50 && bytes[2] == 0x4E && bytes[3] == 0x47;

    private static bool TryParseBbox3857(string bbox, out double[] values)
    {
        values = Array.Empty<double>();
        var parts = bbox.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        if (parts.Length != 4)
            return false;

        values = new double[4];
        for (var i = 0; i < 4; i++)
        {
            if (!double.TryParse(parts[i], NumberStyles.Float, CultureInfo.InvariantCulture, out values[i]))
                return false;
        }

        return values[2] > values[0] && values[3] > values[1];
    }
}
