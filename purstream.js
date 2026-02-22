let WORKING_DOMAIN = null;

async function getWorkingDomain() {
    if (WORKING_DOMAIN) return WORKING_DOMAIN; 

    try {
        console.log("[Purstream] Recherche de l'URL officielle sur purstream.wiki...");
        const response = await soraFetch("https://purstream.wiki/");
        const html = await response.text();
        const match = html.match(/https:\/\/(purstream\.[a-z]+)/);
        
        if (match && match[1]) {
            WORKING_DOMAIN = match[1]; // Ex: purstream.me
            console.log(`[Purstream] Domaine officiel trouvé : ${WORKING_DOMAIN}`);
            return WORKING_DOMAIN;
        } else {
            throw new Error("Impossible de trouver le domaine sur le wiki.");
        }
    } catch (err) {
        console.log(`[Purstream] Échec du wiki. Utilisation du domaine de secours. Erreur: ${err}`);
        WORKING_DOMAIN = "purstream.me"; 
        return WORKING_DOMAIN;
    }
}

async function searchResults(keyword) {
    try {
        const domain = await getWorkingDomain();
        const encodedKeyword = encodeURIComponent(keyword);
        
        // Appel API avec le domaine dynamique
        const responseText = await soraFetch(`https://api.${domain}/api/v1/search-bar/search/${encodedKeyword}`);
        const data = await responseText.json();

        if (!data?.data?.items?.movies?.items) {
             return JSON.stringify([]);
        }

        const transformedResults = data.data.items.movies.items.map(result => {
            let imgUrl = result.large_poster_path || result.small_poster_path || result.wallpaper_poster_path || "https://via.placeholder.com/300x450/222222/FFFFFF?text=Aucune+Affiche";

            if(result.type === "movie") {
                return {
                    title: result.title,
                    image: imgUrl,
                    href: `https://${domain}/movie/${result.id}-${slugify(result.title)}`
                };
            }
            else if(result.type === "tv") {
                return {
                    title: result.title,
                    image: imgUrl,
                    href: `https://${domain}/serie/${result.id}-${slugify(result.title)}`
                };
            }
        }).filter(Boolean);

        return JSON.stringify(transformedResults);
    } catch (error) {
        console.log('Fetch error in searchResults: ' + error);
        return JSON.stringify([]);
    }
}

function slugify(title) {
    return title
      .toLowerCase()
      .normalize("NFKD")                 
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9\s-]/g, "")      
      .trim()
      .replace(/\s+/g, "-")              
      .replace(/-+/g, "-");              
}

async function extractDetails(url) {
    try {
        const domain = await getWorkingDomain();
        let apiUrl = "";

        if(url.includes('movie')) {
            const match = url.match(/\/movie\/(\d+)/);
            if (!match) throw new Error("Invalid URL format");
            apiUrl = `https://api.${domain}/api/v1/media/${match[1]}/sheet`;
        } else if(url.includes('serie')) {
            const match = url.match(/\/serie\/(\d+)/);
            if (!match) throw new Error("Invalid URL format");
            apiUrl = `https://api.${domain}/api/v1/media/${match[1]}/sheet`;
        } else {
            throw new Error("Invalid URL format");
        }

        const responseText = await soraFetch(apiUrl, {
            headers: {
                "Referer": `https://${domain}/`,
                "Origin": `https://${domain}`
            }
        });
        const json = await responseText.json();
        const data = json.data.items;

        const duration = url.includes('movie') && data.runtime?.minutes 
            ? `${data.runtime.minutes} minutes` 
            : 'N/A';

        const transformedResults = [{
            description: data.overview || 'No description available',
            aliases: `Duration: ${duration}`,
            airdate: `Released: ${data.releaseDate ? data.releaseDate : 'N/A'}`
        }];

        return JSON.stringify(transformedResults);

    } catch (error) {
        console.log('Details error: ' + error);
        return JSON.stringify([{
            description: 'Error loading description',
            aliases: 'Duration: Unknown',
            airdate: 'Aired/Released: Unknown'
        }]);
    }
}

async function extractEpisodes(url) {
    try {
        const domain = await getWorkingDomain();

        if(url.includes('movie')) {
            const match = url.match(/\/movie\/(\d+)/);
            if (!match) throw new Error("Invalid URL format");
            
            return JSON.stringify([
                { href: `${match[1]}/movie`, number: 1, title: "Full Movie" }
            ]);
            
        } else if(url.includes('serie')) {
            const match = url.match(/\/serie\/(\d+)/);
            if (!match) throw new Error("Invalid URL format");
            const showId = match[1];

            const responseText = await soraFetch(`https://api.${domain}/api/v1/media/${showId}/sheet`, {
                headers: {
                    "Referer": `https://${domain}/`,
                    "Origin": `https://${domain}`
                }
            });
            const json = await responseText.json();
            const data = json.data.items;
            let allEpisodes = [];

            for (let i = 1; i <= data.seasons; i++) {
                const seasonResponseText = await soraFetch(`https://api.${domain}/api/v1/media/${showId}/season/${i}`, {
                    headers: {
                        "Referer": `https://${domain}/`,
                        "Origin": `https://${domain}`
                    }
                });
                const seasonJson = await seasonResponseText.json();
                const seasonData = seasonJson.data.items;

                for (const episode of seasonData.episodes) {
                    allEpisodes.push({
                        href: `${showId}/${i}/${episode.episode}`,
                        number: episode.episode,
                        title: episode.name
                    });
                }
            }
            return JSON.stringify(allEpisodes);
        } else {
            throw new Error("Invalid URL format");
        }
    } catch (error) {
        console.log('Fetch error in extractEpisodes: ' + error);
        return JSON.stringify([]);
    }    
}

async function extractStreamUrl(url) {
    try {
        let streams = [];

        let showId = "";
        let seasonNumber = "";
        let episodeNumber = "";

        if (url.includes('movie')) {
            const [showIdTemp, episodeNumberTemp] = url.split('/');

            showId = showIdTemp;
            episodeNumber = episodeNumberTemp;
        } else {
            const [showIdTemp, seasonNumberTemp, episodeNumberTemp] = url.split('/');

            showId = showIdTemp;
            seasonNumber = seasonNumberTemp;
            episodeNumber = episodeNumberTemp;
        }

        if (episodeNumber === "movie") {
            const response = await soraFetch(`https://api.purstream.to/api/v1/media/${showId}/sheet`, {
                headers: {
                    "Referer": "https://purstream.to/",
                    "Origin": "https://purstream.to",
                }
            });
            const json = await response.json();
            
            const data = json.data.items;
    
            for (const source of data.urls) {
                const streamUrl = source.url;

                streams.push({
                    title: source.name,
                    streamUrl,
                    headers: {
                        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.1 Safari/605.1.15"
                    }
                });
            }
        } else {
            const response = await soraFetch(`https://api.purstream.to/api/v1/media/${showId}/sheet`, {
                headers: {
                    "Referer": "https://purstream.to/",
                    "Origin": "https://purstream.to"
                }
            });
            const json = await response.json();

            const data = json.data.items;

            for (const source of data.urls) {
                const pad2 = n => String(n).padStart(2, "0");

                const season = pad2(seasonNumber);
                const episode = pad2(episodeNumber);

                let streamUrl = source.url;

                if (streamUrl.includes("{season_number}")) {
                    streamUrl = streamUrl.replaceAll("{season_number}", season);
                }

                if (streamUrl.includes("{episode_number}")) {
                    streamUrl = streamUrl.replaceAll("{episode_number}", episode);
                }

                streams.push({
                    title: source.name,
                    streamUrl,
                    headers: {
                        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.1 Safari/605.1.15"
                    }
                });
            }
        }

        const results = {
            streams,
            subtitles: ""
        };

        console.log(JSON.stringify(results));
        return JSON.stringify(results);
    } catch (error) {
        console.log('Fetch error in extractStreamUrl: ' + error);

        const result = {
            streams: [],
            subtitles: ""
        };

        console.log(result);
        return JSON.stringify(result);
    }
}


async function soraFetch(url, options = { headers: {}, method: 'GET', body: null, encoding: 'utf-8' }) {
    try {
        if (typeof fetchv2 !== 'undefined') {
            return await fetchv2(
                url,
                options.headers ?? {},
                options.method ?? 'GET',
                options.body ?? null,
                true,
                options.encoding ?? 'utf-8'
            );
        } else {
            return await fetch(url, options);
        }
    } catch(e) {
        try {
            return await fetch(url, options);
        } catch(error) {
            return null;
        }
    }
}
