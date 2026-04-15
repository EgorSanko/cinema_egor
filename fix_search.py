import re

with open('/root/movie/hdrezka_server.py', 'r') as f:
    content = f.read()

# Fix 1: Include /cartoons/ and /animation/ in movie type filter
content = content.replace(
    "if '/films/' in url or ('/series/' not in url and",
    "if '/films/' in url or '/cartoons/' in url or '/animation/' in url or ('/series/' not in url and"
)

# Fix 2: Improve year filtering - use InlineInfo.year attribute directly
old_year = """        # Filter by year
        if year:
            for r in filtered:
                info = str(getattr(r, 'info', '') or '')
                if year in info or year in str(getattr(r, 'url', '')):
                    best = r
                    break"""

new_year = """        # Filter by year - check InlineInfo.year attribute first, then fallback to string match
        if year:
            year_int = int(year) if year.isdigit() else None
            for r in filtered:
                info = getattr(r, 'info', None)
                info_year = getattr(info, 'year', None) if info else None
                if info_year and str(info_year) == year:
                    best = r
                    break
                elif year in str(info or '') or year in str(getattr(r, 'url', '')):
                    best = r
                    break"""

content = content.replace(old_year, new_year)

# Fix 3: Remove duplicate type filter block (the first one that was added by URL)
# Check if the duplicate block exists
dup_block = """        # Filter by type via URL
        if type in ('tv', 'series'):
            filtered = [r for r in results if '/series/' in str(getattr(r, 'url', ''))]
            if filtered:
                results = filtered
        elif type == 'movie':
            filtered = [r for r in results if '/films/' in str(getattr(r, 'url', ''))]
            if filtered:
                results = filtered

"""
if dup_block in content:
    content = content.replace(dup_block, "")
    print("Removed duplicate type filter block")

with open('/root/movie/hdrezka_server.py', 'w') as f:
    f.write(content)

print('Done')
