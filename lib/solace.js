
export async function solaceApiCall(method, endpoint, body, token) {
    const baseUrl = 'https://api.solace.cloud/api/v2';
    const url = `${baseUrl}${endpoint}`;

    const headers = {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
    };

    const options = {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
    };

    console.log(`[API] ${method} ${url}`);

    const response = await fetch(url, options);

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API Error (${response.status}): ${errorText}`);
    }

    // Some endpoints return 204 No Content
    if (response.status === 204) return null;

    return response.json();
}

export async function solaceApiCallAll(endpoint, token) {
    let allData = [];
    let pageNumber = 1;
    let totalPages = 1;
    const pageSize = 100;

    // Handle query params in endpoint
    const separator = endpoint.includes('?') ? '&' : '?';
    const baseEndpoint = endpoint;

    do {
        const currentEndpoint = `${baseEndpoint}${separator}pageSize=${pageSize}&pageNumber=${pageNumber}`;
        const response = await solaceApiCall('GET', currentEndpoint, null, token);

        if (response && response.data) {
            allData = allData.concat(response.data);
            if (response.meta && response.meta.pagination) {
                totalPages = response.meta.pagination.totalPages;
            }
        }
        pageNumber++;
    } while (pageNumber <= totalPages);

    return { data: allData };
}
