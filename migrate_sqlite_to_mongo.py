import getpass
import os
import sqlite3
import sys

from pymongo import MongoClient
from pymongo.errors import DuplicateKeyError
from config import DB_PATH

def main():
    if not os.path.exists(DB_PATH):
        raise SystemExit(f"SQLite database not found: {DB_PATH}")

    uri = getpass.getpass("Paste your MongoDB Atlas URI (input hidden): ").strip()
    if not uri:
        raise SystemExit("No URI provided. Nothing migrated.")

    db_name = input("MongoDB database name [omnitranslate]: ").strip() or "omnitranslate"
    client = MongoClient(uri, serverSelectionTimeoutMS=10000)
    try:
        client.admin.command("ping")
        target = client[db_name]

        target.users.create_index("email", unique=True)
        target.users.create_index("id", unique=True)
        target.profiles.create_index("id", unique=True)
        target.history.create_index("id", unique=True)
        target.history.create_index([("profile_id", 1), ("timestamp", -1)])

        with sqlite3.connect(DB_PATH) as source:
            source.row_factory = sqlite3.Row
            tables = {
                row["name"]
                for row in source.execute(
                    "SELECT name FROM sqlite_master WHERE type='table'"
                )
            }

            required = {"users", "profiles", "history"}
            missing = required - tables
            if missing:
                raise RuntimeError(
                    f"Expected SQLite tables missing: {', '.join(sorted(missing))}"
                )

            migrated = {}
            for table in ("users", "profiles", "history"):
                documents = [
                    dict(row)
                    for row in source.execute(f'SELECT * FROM "{table}"')
                ]

                if table == "history":
                    for doc in documents:
                        doc["id"] = int(doc["id"])

                key = "id"
                inserted = updated = 0
                for doc in documents:
                    result = target[table].update_one(
                        {key: doc[key]},
                        {"$set": doc},
                        upsert=True,
                    )
                    inserted += int(result.upserted_id is not None)
                    updated += int(result.matched_count > 0)

                migrated[table] = (len(documents), inserted, updated)

            max_id = target.history.find_one(
                sort=[("id", -1)], projection={"id": 1}
            )
            if max_id:
                target.counters.update_one(
                    {"_id": "history_id"},
                    {"$max": {"value": int(max_id["id"])}},
                    upsert=True,
                )

        print("\nMigration finished. SQLite was not changed.")
        for table, (total, inserted, updated) in migrated.items():
            print(
                f"{table}: source={total}, inserted={inserted}, "
                f"updated={updated}"
            )

        for table, (total, _, _) in migrated.items():
            target_count = target[table].count_documents({})
            print(f"{table}: MongoDB total={target_count}")
            if target_count < total:
                raise RuntimeError(
                    f"Verification failed for {table}: MongoDB count is below source count."
                )

        print("\nCount verification passed. Keep the SQLite backup.")
    finally:
        client.close()

if __name__ == "__main__":
    try:
        main()
    except DuplicateKeyError:
        print(
            "Migration stopped: a unique email or ID conflicts with existing "
            "Atlas data. No SQLite records were changed.",
            file=sys.stderr,
        )
        sys.exit(1)
    except Exception as exc:
        print(f"Migration failed: {type(exc).__name__}: {exc}", file=sys.stderr)
        sys.exit(1)
