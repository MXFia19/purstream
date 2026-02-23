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
        const cleanKeyword = keyword.trim().toLowerCase();
        let apiUrl = "";
        let isCatalog = false;

        // --- GESTION DES COMMANDES SPÉCIALES ---
        if (cleanKeyword === "!anime") {
            // Derniers animes ajoutés
            apiUrl = `https://api.${domain}/api/v1/catalog/movies?page=1&sortBy=recently-added&types=anime&categoriesIds=*&franchisesIds=*&displayMode=large&perPage=20`;
            isCatalog = true;
        } else if (cleanKeyword === "!movie" || cleanKeyword === "!film") {
            // Derniers films ajoutés
            apiUrl = `https://api.${domain}/api/v1/catalog/movies?page=1&sortBy=recently-added&types=movie&categoriesIds=*&franchisesIds=*&displayMode=large&perPage=20`;
            isCatalog = true;
        } else if (cleanKeyword === "!serie" || cleanKeyword === "!tv") {
            // Dernières séries ajoutées
            apiUrl = `https://api.${domain}/api/v1/catalog/movies?page=1&sortBy=recently-added&types=tv&categoriesIds=*&franchisesIds=*&displayMode=large&perPage=20`;
            isCatalog = true;
        } else if (cleanKeyword === "!top") {
            // Les mieux notés (Films et Séries)
            apiUrl = `https://api.${domain}/api/v1/catalog/movies?page=1&sortBy=best-rated&types=*&categoriesIds=*&franchisesIds=*&displayMode=large&perPage=20`;
            isCatalog = true;
        } else if (cleanKeyword === "!trend" || cleanKeyword === "!populaire") {
            // Les plus vus
            apiUrl = `https://api.${domain}/api/v1/catalog/movies?page=1&sortBy=most-viewed&types=*&categoriesIds=*&franchisesIds=*&displayMode=large&perPage=20`;
            isCatalog = true;
        } else if (cleanKeyword === "!new") {
            // Les toutes dernières nouveautés (Toutes catégories)
            apiUrl = `https://api.${domain}/api/v1/catalog/movies?page=1&sortBy=newest&types=*&categoriesIds=*&franchisesIds=*&displayMode=large&perPage=20`;
            isCatalog = true;
        } else {
            // --- RECHERCHE NORMALE ---
            const encodedKeyword = encodeURIComponent(keyword);
            apiUrl = `https://api.${domain}/api/v1/search-bar/search/${encodedKeyword}`;
        }

        const responseText = await soraFetch(apiUrl);
        const data = await responseText.json();

        let items = [];

        // L'API Catalogue et l'API Recherche n'ont pas la même structure JSON
        if (isCatalog) {
            // Le catalogue met les résultats dans un tableau paginé
            items = data?.data?.items || data?.data?.data || data?.data || [];
        } else {
            // La recherche normale met les résultats profondément dans 'movies.items'
            items = data?.data?.items?.movies?.items || [];
        }

        if (!items || items.length === 0) {
             return JSON.stringify([]);
        }

        const transformedResults = items.map(result => {
            // On récupère la meilleure image disponible
            let imgUrl = result.large_poster_path || result.small_poster_path || result.wallpaper_poster_path || result.poster_path || "https://via.placeholder.com/300x450/222222/FFFFFF?text=Aucune+Affiche";

            // On s'assure que le titre existe
            let title = result.title || result.name || "Titre inconnu";

            // On détermine si on doit créer un lien /movie/ ou /serie/
            let hrefType = (result.type === "movie") ? "movie" : "serie";

            return {
                title: title,
                image: imgUrl,
                href: `https://${domain}/${hrefType}/${result.id}-${slugify(title)}`
            };
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

        // On découpe l'URL interne
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

        // On appelle l'API qui GÉNÈRE LE JETON CRYPTÉ
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

        // On récupère le lien officiel avec le fameux ?token=...
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
