document.addEventListener('DOMContentLoaded', () => {
    // ---- Page Detection ----
    const isPostPage = !!document.getElementById('postGameForm');

    // ---- Shared Data Logic ----
    let favorites = JSON.parse(localStorage.getItem('gameFavorites')) || [];
    let localGames = JSON.parse(localStorage.getItem('localGames')) || [];

    // Globals for File System Access
    let projectHandle = null;

    // ---- Post Page Logic ----
    if (isPostPage) {
        setupPostPage();
        return;
    }

    // ---- Index Page Logic ----
    const gamesContainer = document.getElementById('gamesContainer');
    const searchBar = document.getElementById('searchBar');
    const sortSelect = document.getElementById('sortSelect');
    const btnAll = document.getElementById('btn-all');
    const btnFavorites = document.getElementById('btn-favorites');
    const myGamesBtn = document.getElementById('myGamesBtn');
    const genreCheckboxes = document.querySelectorAll('.genre-list input[type="checkbox"]');

    let allGames = [];
    let currentFilter = 'all';

    if (typeof gamesData !== 'undefined') {
        allGames = [...localGames, ...gamesData];
        // Deduplicate by ID
        allGames = Array.from(new Map(allGames.map(item => [item.id, item])).values());
        renderGames();
    }

    // Handlers
    if (btnAll) btnAll.onclick = () => setFilter('all');
    if (btnFavorites) btnFavorites.onclick = () => setFilter('favorites');
    if (myGamesBtn) myGamesBtn.onclick = (e) => { e.preventDefault(); setFilter('mygames'); };
    if (sortSelect) sortSelect.onchange = () => renderGames();
    if (genreCheckboxes.length > 0) genreCheckboxes.forEach(cb => cb.onchange = () => renderGames());
    if (searchBar) searchBar.addEventListener('input', () => renderGames());

    function setFilter(filter) {
        currentFilter = filter;
        document.querySelectorAll('.sidebar li, .post-btn').forEach(el => el.classList.remove('active'));
        if (filter === 'all') btnAll.classList.add('active');
        if (filter === 'favorites') btnFavorites.classList.add('active');
        if (filter === 'mygames') {
            myGamesBtn.style.background = 'var(--accent-color)';
            myGamesBtn.style.color = 'white';
        } else {
            myGamesBtn.style.background = 'white';
            myGamesBtn.style.color = 'var(--accent-color)';
        }
        renderGames();
    }

    window.toggleFavorite = function (e, gameId) {
        e.stopPropagation();
        if (favorites.includes(gameId)) favorites = favorites.filter(id => id !== gameId);
        else favorites.push(gameId);
        localStorage.setItem('gameFavorites', JSON.stringify(favorites));
        renderGames();
    }

    async function deleteGame(gameId) {
        if (!confirm('本当に削除しますか？\nAre you sure you want to delete this game?')) return;

        try {
            // 1. Connect to Project Folder (Required for Deletion)
            if (!projectHandle) {
                alert('削除するためにプロジェクトフォルダを選択してください。\nPlease select the project folder to delete.');
                projectHandle = await window.showDirectoryPicker();
            }

            // 2. Update games.js (Remove Entry)
            const gamesJsHandle = await projectHandle.getFileHandle('games.js', { create: false });
            const file = await gamesJsHandle.getFile();
            let text = await file.text();

            // Parse existing data (Assume standard array format)
            // Robust parsing: extract content between [ and ]
            const startBracket = text.indexOf('[');
            const endBracket = text.lastIndexOf(']');
            if (startBracket !== -1 && endBracket !== -1) {
                const jsonContent = text.substring(startBracket, endBracket + 1);
                let data = JSON.parse(jsonContent);

                // Filter out the game
                const initialLength = data.length;
                data = data.filter(g => g.id !== gameId);

                if (data.length === initialLength) {
                    alert('Game not found in games.js (might be local-only or already deleted).');
                } else {
                    // Write back
                    const newContent = `const gamesData = ${JSON.stringify(data, null, 4)};`;
                    const writable = await gamesJsHandle.createWritable();
                    await writable.write(newContent);
                    await writable.close();
                }
            }

            // 3. Delete Game Folder (Optional but recommended)
            try {
                const gamesDir = await projectHandle.getDirectoryHandle('games', { create: false });
                await gamesDir.removeEntry(gameId, { recursive: true });
            } catch (folderErr) {
                console.warn('Game folder not found or could not be deleted:', folderErr);
            }

            alert('Game Deleted Successfully!');
            location.reload();

        } catch (err) {
            console.error(err);
            alert('Error deleting game: ' + err.message);
        }
    }

    function renderGames() {
        if (!gamesContainer) return;
        gamesContainer.innerHTML = '';

        let games = allGames.filter(game => {
            const matchesSearch = game.title.toLowerCase().includes(searchBar.value.toLowerCase());
            let matchesFilter = true;
            if (currentFilter === 'favorites') matchesFilter = favorites.includes(game.id);
            // MyGames: Show ALL games (Admin Mode)
            if (currentFilter === 'mygames') matchesFilter = true;

            const selectedGenres = Array.from(genreCheckboxes).filter(cb => cb.checked).map(cb => cb.value);
            const matchesGenre = selectedGenres.length === 0 || (game.genres && selectedGenres.every(g => game.genres.includes(g)));
            return matchesSearch && matchesFilter && matchesGenre;
        });

        // Sort
        const sortType = sortSelect ? sortSelect.value : 'popularity';
        games.sort((a, b) => {
            if (sortType === 'popularity') return (b.views || 0) - (a.views || 0);
            if (sortType === 'newest') return new Date(b.date) - new Date(a.date);
            if (sortType === 'oldest') return new Date(a.date) - new Date(b.date);
            return 0;
        });

        if (games.length === 0) {
            gamesContainer.innerHTML = '<p style="text-align:center; grid-column: 1/-1;">No games found.</p>';
            return;
        }

        games.forEach(game => {
            const card = document.createElement('div');
            card.className = 'game-card';

            // Interaction Logic
            let clickAction, extraButtons = '';

            if (currentFilter === 'mygames') {
                // Admin Actions
                clickAction = `location.href='post.html?edit=${game.id}'`;
                extraButtons = `
                    <div class="admin-actions" style="margin-top: 10px; display: flex; gap: 5px;">
                        <button onclick="event.stopPropagation(); location.href='post.html?edit=${game.id}'" style="flex:1; padding: 5px; background:#4CAF50; color:white; border:none; border-radius:4px; cursor:pointer;">Edit</button>
                        <button id="del-btn-${game.id}" style="flex:1; padding: 5px; background:#f44336; color:white; border:none; border-radius:4px; cursor:pointer;">Delete</button>
                    </div>
                `;
            } else {
                // Play Action
                clickAction = `window.open('${game.url || '#'}', '_blank')`;
            }

            const isNew = game.isNew ? '<span class="new-badge">NEW</span>' : '';
            const isFav = favorites.includes(game.id);
            const heartClass = isFav ? 'fav-btn active' : 'fav-btn';
            const heartIcon = isFav ? '❤️' : '♡';

            card.innerHTML = `
                ${isNew}
                <img src="${game.icon}" alt="${game.title}" class="game-icon" onclick="${clickAction}">
                <div class="title-row">
                    <div class="${heartClass}" onclick="toggleFavorite(event, '${game.id}')">
                         ${heartIcon}
                    </div>
                    <div class="game-title" onclick="${clickAction}">${game.title}</div>
                </div>
                <div class="game-desc">${game.description || ''}</div>
                ${extraButtons}
            `;
            gamesContainer.appendChild(card);

            // Bind Delete Event (to avoid inline function string issues)
            if (currentFilter === 'mygames') {
                const delBtn = card.querySelector(`#del-btn-${game.id}`);
                if (delBtn) delBtn.onclick = (e) => {
                    e.stopPropagation();
                    deleteGame(game.id);
                };
            }
        });
    }

    // ==========================================
    // POST PAGE LOGIC (GitHub API)
    // ==========================================
    function setupPostPage() {
        const form = document.getElementById('postGameForm');
        const githubOwnerInput = document.getElementById('githubOwner');
        const githubRepoInput = document.getElementById('githubRepo');
        const githubTokenInput = document.getElementById('githubToken');
        const saveSettingsBtn = document.getElementById('saveGitHubSettings');
        const githubStatus = document.getElementById('githubStatus');

        // Inputs
        const titleInput = document.getElementById('gameTitle');
        const descInput = document.getElementById('gameDesc');
        const urlInput = document.getElementById('gameUrlInput');
        const iconInput = document.getElementById('iconFileInput');
        const btn = document.querySelector('button[type="submit"]');

        // Load saved GitHub settings
        const savedConfig = JSON.parse(localStorage.getItem('githubConfig') || '{}');
        if (savedConfig.owner) githubOwnerInput.value = savedConfig.owner;
        if (savedConfig.repo) githubRepoInput.value = savedConfig.repo;
        if (savedConfig.token) githubTokenInput.value = savedConfig.token;

        // Check if settings are already saved
        if (savedConfig.owner && savedConfig.repo && savedConfig.token) {
            form.style.filter = 'none';
            form.style.opacity = '1';
            form.style.pointerEvents = 'auto';
            githubStatus.textContent = `✅ Connected to ${savedConfig.owner}/${savedConfig.repo}`;
        }

        // Check for Edit Mode
        const urlParams = new URLSearchParams(window.location.search);
        const editId = urlParams.get('edit');
        if (editId) {
            const allGamesConcat = [...localGames, ...((typeof gamesData !== 'undefined') ? gamesData : [])];
            const uniqueGames = Array.from(new Map(allGamesConcat.map(item => [item.id, item])).values());
            const gameToEdit = uniqueGames.find(g => g.id === editId);

            if (gameToEdit) {
                titleInput.value = gameToEdit.title;
                descInput.value = gameToEdit.description;
                if (gameToEdit.url) urlInput.value = gameToEdit.url;
                document.querySelectorAll('.genre-checkboxes input').forEach(cb => {
                    if (gameToEdit.genres && gameToEdit.genres.includes(cb.value)) cb.checked = true;
                });
                document.querySelector('h1').textContent = 'Update Game';
                btn.textContent = 'UPDATE GAME';
                btn.style.background = '#4CAF50';
            }
        }

        // Save GitHub Settings
        saveSettingsBtn.addEventListener('click', () => {
            const owner = githubOwnerInput.value.trim();
            const repo = githubRepoInput.value.trim();
            const token = githubTokenInput.value.trim();

            if (!owner || !repo || !token) {
                return alert('すべての項目を入力してください。\nPlease fill in all fields.');
            }

            const config = { owner, repo, token };
            localStorage.setItem('githubConfig', JSON.stringify(config));

            form.style.filter = 'none';
            form.style.opacity = '1';
            form.style.pointerEvents = 'auto';
            githubStatus.textContent = `✅ Connected to ${owner}/${repo}`;
            alert('設定を保存しました！\nSettings saved!');
        });

        // Helper: Convert File to Base64
        function fileToBase64(file) {
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => {
                    const base64 = reader.result.split(',')[1];
                    resolve(base64);
                };
                reader.onerror = reject;
                reader.readAsDataURL(file);
            });
        }

        // Helper: GitHub API - Get File
        async function getGitHubFile(path) {
            const config = JSON.parse(localStorage.getItem('githubConfig') || '{}');
            const url = `https://api.github.com/repos/${config.owner}/${config.repo}/contents/${path}`;

            const response = await fetch(url, {
                headers: {
                    'Authorization': `token ${config.token}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            });

            if (response.status === 404) return null;
            if (!response.ok) throw new Error(`GitHub API Error: ${response.status}`);

            return await response.json();
        }

        // Helper: GitHub API - Create/Update File
        async function putGitHubFile(path, content, message, sha = null) {
            const config = JSON.parse(localStorage.getItem('githubConfig') || '{}');
            const url = `https://api.github.com/repos/${config.owner}/${config.repo}/contents/${path}`;

            const body = {
                message: message,
                content: content
            };
            if (sha) body.sha = sha;

            const response = await fetch(url, {
                method: 'PUT',
                headers: {
                    'Authorization': `token ${config.token}`,
                    'Accept': 'application/vnd.github.v3+json',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(body)
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(`GitHub API Error: ${error.message || response.status}`);
            }

            return await response.json();
        }

        // Submit Form
        form.addEventListener('submit', async (e) => {
            e.preventDefault();

            const config = JSON.parse(localStorage.getItem('githubConfig') || '{}');
            if (!config.owner || !config.repo || !config.token) {
                return alert('GitHub設定を先に保存してください。\nPlease save GitHub settings first.');
            }

            if (!urlInput.value) {
                return alert('ゲームのURLを入力してください。\nPlease enter a Game URL.');
            }

            btn.disabled = true;
            btn.textContent = 'Processing...';

            const title = titleInput.value;
            const desc = descInput.value;
            const simpleSlug = title.toLowerCase().replace(/[^a-z0-9]/g, '');
            const id = editId || (simpleSlug.length > 0 ? simpleSlug + '_' + Date.now() : 'game_' + Date.now());
            const genres = Array.from(document.querySelectorAll('.genre-checkboxes input:checked')).map(cb => cb.value);

            try {
                // 1. Upload Icon (if provided)
                let iconPath = editId ? null : `games/${id}/icon.png`;
                if (editId) {
                    const allGamesConcat = [...localGames, ...((typeof gamesData !== 'undefined') ? gamesData : [])];
                    const existing = allGamesConcat.find(g => g.id === editId);
                    if (existing) iconPath = existing.icon;
                }

                if (iconInput.files.length > 0) {
                    btn.textContent = 'Uploading icon...';
                    const iconFile = iconInput.files[0];
                    const iconBase64 = await fileToBase64(iconFile);
                    iconPath = `games/${id}/icon.png`;

                    const existingIcon = await getGitHubFile(iconPath);
                    await putGitHubFile(
                        iconPath,
                        iconBase64,
                        `Add/Update icon for ${title}`,
                        existingIcon?.sha
                    );
                }

                // 2. Update games.js
                btn.textContent = 'Updating games.js...';
                const gamesJsFile = await getGitHubFile('games.js');

                if (!gamesJsFile) {
                    throw new Error('games.js not found in repository');
                }

                // Decode and parse
                const gamesJsContent = atob(gamesJsFile.content);
                const startBracket = gamesJsContent.indexOf('[');
                const endBracket = gamesJsContent.lastIndexOf(']');

                if (startBracket === -1 || endBracket === -1) {
                    throw new Error('Invalid games.js format');
                }

                const jsonContent = gamesJsContent.substring(startBracket, endBracket + 1);
                let data = JSON.parse(jsonContent);

                // Construct Entry
                const entry = {
                    id: id,
                    title: title,
                    icon: iconPath || 'games/default_icon.png',
                    url: urlInput.value,
                    description: desc,
                    isNew: !editId,
                    views: editId ? (data.find(g => g.id === id)?.views || 0) : 0,
                    date: new Date().toISOString().split('T')[0],
                    genres: genres
                };

                if (editId) {
                    const index = data.findIndex(g => g.id === editId);
                    if (index !== -1) {
                        data[index] = entry;
                    } else {
                        data.push(entry);
                    }
                } else {
                    data.push(entry);
                }

                // Encode and upload
                const newContent = `const gamesData = ${JSON.stringify(data, null, 4)};`;
                const newContentBase64 = btoa(unescape(encodeURIComponent(newContent)));

                await putGitHubFile(
                    'games.js',
                    newContentBase64,
                    editId ? `Update game: ${title}` : `Add new game: ${title}`,
                    gamesJsFile.sha
                );

                alert(editId ? 'ゲームを更新しました！\nGame Updated Successfully!' : 'ゲームを投稿しました！\nGame Posted Successfully!');
                window.location.href = 'index.html';

            } catch (err) {
                console.error(err);
                alert('エラー / Error: ' + err.message);
                btn.disabled = false;
                btn.textContent = editId ? 'UPDATE GAME' : 'Post Game';
            }
        });
    }
});
