
logo_b64 = open('/tmp/logo_b64.txt').read().strip()
logo_uri = f"data:image/jpeg;base64,{logo_b64}"

src = open('/home/claude/dashboard_template.html', encoding='utf-8').read()
out = src.replace('LOGO_PLACEHOLDER', logo_uri)

open('/mnt/user-data/outputs/dashboard_admin.html', 'w', encoding='utf-8').write(out)
print("Done, size:", len(out))
