# Deploy (git pull se server update)

Local (Windows):  `powershell -File deploy\deploy.ps1`  (naya code commit karke chalao)
Ye GitHub par push karta hai, phir server par `~/jarvis_repo` me `git pull` karke `server/` ko live `ai/` folder me copy karta hai.

- `config.php`, database (`data/*.sqlite`), logs aur uploads kabhi nahi chhue jate.
- Copy se pehle har PHP file ka syntax check hota hai; galti ho to kuch nahi badalta.
- Copy se pehle live code ka backup `~/jarvis_backups/` me banta hai (aakhri 10 rakhe jate hain).
- Copy ke baad site check hoti hai; 200 na aaye to purana code apne aap wapas aa jata hai.
- Wapas purane version par jana ho: `tar xzf ~/jarvis_backups/ai_code_<time>.tgz -C ~/domains/udaypurgroup.in/public_html/ai`

Dusre VPS par: `REPO_URL`, `LIVE`, `SITE` environment variables badal kar `bash deploy/server-update.sh` chalao.
Windows app ka naya exe alag se banta hai (`agent\build_windows.bat`) aur server ke `jarvis_data/downloads` me chadhta hai.
