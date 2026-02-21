// ==========================================
// 🔔 CONFIGURATION DU WEBHOOK
// ==========================================
const WEBHOOK_URL = "https://discord.com/api/webhooks/1260345744754212874/3QR7uNASfGXs7gaxXo3U8YInr6GR1kxrLvCwnR49Sp6Dd8UeRdgvaa6q-7bPQRkV6XtT"; // Remplace par ton URL (Discord, Slack, etc.)

// Fonction pour envoyer le message
async function sendWebhook(message) {
    if (!WEBHOOK_URL || WEBHOOK_URL === "TON_LIEN_WEBHOOK_ICI") return; // Sécurité si pas configuré

    try {
        await soraFetch(WEBHOOK_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                username: "Sora Purstream", // Nom du bot
                avatar_url: "https://purstream.me/favicon.ico", // Icône
                content: message // Le message envoyé
            })
        });
    } catch (e) {
        console.log("Erreur Webhook: " + e);
    }
}


// ==========================================
// 🔍 1. RECHERCHE
// ==========================================
async function searchResults(keyword) {
    try {
        const encodedKeyword = encodeURIComponent(keyword);
        const responseText = await soraFetch(`https://api.purstream.me/api/v1/search-bar/search/${encodedKeyword}`);
        const data = await responseText.json();

        // Sécurité si aucun résultat
        if (!data?.data?.items?.movies?.items) {
             // 🔔 Envoi d'un webhook pour une recherche vide
             sendWebhook(`🔍 **Recherche sans résultat :** \`${keyword}\``);
             return JSON.stringify([]);
        }

        const transformedResults = data.data.items.movies.items.map(result => {
            let imgUrl = result.large_poster_path || result.small_poster_path || result.wallpaper_poster_path || "https://via.placeholder.com/300x450/222222/FFFFFF?text=Aucune+Affiche";

            if(result.type === "movie") {
                return {
                    title: result.title,
                    image: imgUrl,
                    href: `https://purstream.me/movie/${result.id}-${slugify(result.title)}`
                };
            }
            else if(result.type === "tv") {
                return {
                    title: result.title,
                    image: imgUrl,
                    href: `https://purstream.me/serie/${result.id}-${slugify(result.title)}`
                };
            }
        }).filter(Boolean);

        // 🔔 Envoi du webhook avec le mot clé et le nombre de résultats trouvés
        sendWebhook(`🔍 **Nouvelle recherche :** \`${keyword}\` (${transformedResults.length} résultats trouvés)`);

        return JSON.stringify(transformedResults);
    } catch (error) {
        console.log('Fetch error in searchResults: ' + error);
        return JSON.stringify([{ title: 'Error', image: '', href: '' }]);
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


// ==========================================
// ℹ️ 2. DÉTAILS
// ==========================================
async function extractDetails(url) {
    try {
        if(url.includes('movie')) {
            const match = url.match(/\/movie\/(\d+)/);
            if (!match) throw new Error("Invalid URL format");

            const movieId = match[1];
            const responseText = await soraFetch(`https://api.purstream.me/api/v1/media/${movieId}/sheet`, {
                headers: {
                    "Referer": "https://purstream.me/",
                    "Origin": "https://purstream.me"
                }
            });
            const json = await responseText.json();
            const data = json.data.items;

            const transformedResults = [{
                description: data.overview || 'No description available',
                aliases: `Duration: ${data.runtime.minutes ? data.runtime.minutes + " minutes" : 'N/A'}`,
                airdate: `Released: ${data.releaseDate ? data.releaseDate : 'N/A'}`
            }];

            return JSON.stringify(transformedResults);
        } else if(url.includes('serie')) {
            const match = url.match(/\/serie\/(\d+)/);
            if (!match) throw new Error("Invalid URL format");

            const showId = match[1];
            const responseText = await soraFetch(`https://api.purstream.me/api/v1/media/${showId}/sheet`, {
                headers: {
                    "Referer": "https://purstream.me/",
                    "Origin": "https://purstream.me"
                }
            });
            const json = await responseText.json();
            const data = json.data.items;

            const transformedResults = [{
                description: data.overview || 'No description available',
                aliases: `Duration: N/A`,
                airdate: `Released: ${data.releaseDate ? data.releaseDate : 'N/A'}`
            }];

            return JSON.stringify(transformedResults);
        } else {
            throw new Error("Invalid URL format");
        }
    } catch (error) {
        console.log('Details error: ' + error);
        return JSON.stringify([{ description: 'Error loading description', aliases: 'Duration: Unknown', airdate: 'Aired/Released: Unknown' }]);
    }
}


// ==========================================
// 📺 3. ÉPISODES
// ==========================================
async function extractEpisodes(url) {
    try {
        if(url.includes('movie')) {
            const match = url.match(/\/movie\/(\d+)/);
            if (!match) throw new Error("Invalid URL format");
            const movieId = match[1];

            return JSON.stringify([
                { href: `${movieId}/movie`, number: 1, title: "Full Movie" }
            ]);
        } else if(url.includes('serie')) {
            const match = url.match(/\/serie\/(\d+)/);
            if (!match) throw new Error("Invalid URL format");
            const showId = match[1];

            const responseText = await soraFetch(`https://api.purstream.me/api/v1/media/${showId}/sheet`, {
                headers: { "Referer": "https://purstream.me/", "Origin": "https://purstream.me" }
            });
            const json = await responseText.json();
            const data = json.data.items;
            let allEpisodes = [];

            for (let i = 1; i <= data.seasons; i++) {
                const seasonResponseText = await soraFetch(`https://api.purstream.me/api/v1/media/${showId}/season/${i}`, {
                    headers: { "Referer": "https://purstream.me/", "Origin": "https://purstream.me" }
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


// ==========================================
// ▶️ 4. STREAM (Lancement vidéo)
// ==========================================
async function extractStreamUrl(url) {
    try {
        let streams = [];
        let showId = "";
        let seasonNumber = "";
        let episodeNumber = "";

        // 🔔 Envoi d'un webhook pour prévenir du lancement de la vidéo !
        let typeMedia = url.includes('movie') ? 'Film' : 'Série';
        sendWebhook(`▶️ **Vidéo lancée** | Format : ${typeMedia} | Chemin ID : \`${url}\``);

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
            const response = await soraFetch(`https://api.purstream.me/api/v1/media/${showId}/sheet`, {
                headers: { "Referer": "https://purstream.me/", "Origin": "https://purstream.me" }
            });
            const json = await response.json();
            const data = json.data.items;
    
            for (const source of data.urls) {
                streams.push({
                    title: source.name,
                    streamUrl: source.url,
                    headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.1 Safari/605.1.15" }
                });
            }
        } else {
            const response = await soraFetch(`https://api.purstream.me/api/v1/media/${showId}/sheet`, {
                headers: { "Referer": "https://purstream.me/", "Origin": "https://purstream.me" }
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
                    headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.1 Safari/605.1.15" }
                });
            }
        }

        const results = { streams, subtitles: "" };
        console.log(JSON.stringify(results));
        return JSON.stringify(results);

    } catch (error) {
        console.log('Fetch error in extractStreamUrl: ' + error);
        return JSON.stringify({ streams: [], subtitles: "" });
    }
}


// ==========================================
// 🛠️ UTILITAIRE FETCH
// ==========================================
async function soraFetch(url, options = { headers: {}, method: 'GET', body: null, encoding: 'utf-8' }) {
    try {
        return await fetchv2(
            url,
            options.headers ?? {},
            options.method ?? 'GET',
            options.body ?? null,
            true,
            options.encoding ?? 'utf-8'
        );
    } catch(e) {
        try {
            return await fetch(url, options);
        } catch(error) {
            return null;
        }
    }
}
