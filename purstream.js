let WORKING_DOMAIN = null;

// 1. Récupère TOUS les domaines sur le wiki (comme Anime-Sama)
async function getDomainsList() {
    try {
        console.log("[Purstream] Récupération de la liste des domaines sur purstream.wiki...");
        const response = await soraFetch("https://purstream.wiki/");
        const html = await response.text();

        const domainRegex = /https:\/\/(purstream\.[a-z]+)/g;
        const domains = new Set(); // Set évite les doublons
        let match;
        
        while ((match = domainRegex.exec(html)) !== null) {
            domains.add(match[1]);
        }

        const domainsArray = Array.from(domains);
        if (domainsArray.length > 0) {
            console.log(`[Purstream] Domaines trouvés : ${domainsArray.join(', ')}`);
            return domainsArray;
        } else {
            return ["purstream.me"];
        }
    } catch (err) {
        console.log(`[Purstream] Erreur wiki, fallback sur purstream.me`);
        return ["purstream.me"];
    }
}

// Fonction utilitaire pour garantir qu'on a un domaine pour les autres fonctions
async function getWorkingDomain() {
    if (WORKING_DOMAIN) return WORKING_DOMAIN; 
    const domains = await getDomainsList();
    WORKING_DOMAIN = domains[0];
    return WORKING_DOMAIN;
}

// 2. Fonction de recherche dédiée à un seul domaine (comme Anime-Sama)
async function trySearch(domain, encodedKeyword) {
    try {
        const responseText = await soraFetch(`https://api.${domain}/api/v1/search-bar/search/${encodedKeyword}`);
        const data = await responseText.json();

        if (!data?.data?.items?.movies?.items) {
             return [];
        }

        return data.data.items.movies.items.map(result => {
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
    } catch (error) {
        return []; // Retourne un tableau vide si le domaine est mort
    }
}

// 3. Le cerveau de la recherche : teste les domaines en cascade
async function searchResults(keyword) {
    try {
        const domains = await getDomainsList();
        const encodedKeyword = encodeURIComponent(keyword);
        
        // On teste le premier domaine
        const firstDomain = domains[0];
        const firstResult = await trySearch(firstDomain, encodedKeyword);
        
        if (firstResult && firstResult.length > 0) {
            WORKING_DOMAIN = firstDomain; // On verrouille ce domaine pour le reste !
            return JSON.stringify(firstResult);
        }

        // Si le 1er échoue, on teste les autres en parallèle
        const otherDomains = domains.slice(1);
        if (otherDomains.length > 0) {
            const promises = otherDomains.map(domain => trySearch(domain, encodedKeyword));
            const results = await Promise.all(promises);

            for (let i = 0; i < results.length; i++) {
                if (results[i] && results[i].length > 0) {
                    WORKING_DOMAIN = otherDomains[i]; // On verrouille le domaine victorieux !
                    return JSON.stringify(results[i]);
                }
            }
        }

        return JSON.stringify([]);
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
                try {
                    const seasonResponseText = await soraFetch(`https://api.${domain}/api/v1/media/${showId}/season/${i}`, {
                        headers: {
                            "Referer": `https://${domain}/`,
                            "Origin": `https://${domain}`
                        }
                    });
                    const seasonJson = await seasonResponseText.json();
                    
                    if (seasonJson && seasonJson.data && seasonJson.data.items) {
                        const seasonData = seasonJson.data.items;
                        for (const episode of seasonData.episodes) {
                            allEpisodes.push({
                                href: `${showId}/${i}/${episode.episode}`,
                                number: episode.episode,
                                title: episode.name || `Épisode ${episode.episode}`
                            });
                        }
                    }
                } catch (e) {
                    console.log(`[Purstream] Erreur chargement saison ${i}:`, e);
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
        const domain = await getWorkingDomain();
        let streams = [];
        let showId = "";
        let seasonNumber = "";
        let episodeNumber = "";

        if (url.includes('movie')) {
            const parts = url.split('/');
            showId = parts[0];
            episodeNumber = parts[1];
        } else {
            const parts = url.split('/');
            showId = parts[0];
            seasonNumber = parts[1];
            episodeNumber = parts[2];
        }

        let apiUrl = episodeNumber === "movie" 
            ? `https://api.${domain}/api/v1/stream/${showId}`
            : `https://api.${domain}/api/v1/stream/${showId}/episode?season=${seasonNumber}&episode=${episodeNumber}`;

        const response = await soraFetch(apiUrl, {
            headers: {
                "Referer": `https://${domain}/`,
                "Origin": `https://${domain}`,
            }
        });
        const json = await response.json();
        const sources = json?.data?.items?.sources || [];

        for (const source of sources) {
            if (source.stream_url) {
                streams.push({
                    title: source.source_name || "Purstream (Ouvrir avec VLC)",
                    streamUrl: source.stream_url,
                    headers: {
                        "Origin": `https://${domain}`,
                        "Referer": `https://${domain}/`,
                        "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1"
                    }
                });
            }
        }

        return JSON.stringify({ streams, subtitles: "" });

    } catch (error) {
        console.log('Fetch error in extractStreamUrl: ' + error);
        return JSON.stringify({ streams: [], subtitles: "" });
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
