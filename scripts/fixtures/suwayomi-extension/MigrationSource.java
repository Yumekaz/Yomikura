package app.yomikura.fixture;

import eu.kanade.tachiyomi.source.model.FilterList;
import eu.kanade.tachiyomi.source.model.MangasPage;
import eu.kanade.tachiyomi.source.model.Page;
import eu.kanade.tachiyomi.source.model.SChapter;
import eu.kanade.tachiyomi.source.model.SManga;
import eu.kanade.tachiyomi.source.online.HttpSource;
import java.util.List;
import rx.Observable;

/** Original test source. Only the disposable runner's loopback server serves images. */
public final class MigrationSource extends HttpSource {
    @Override public String getName() { return "Yomikura migration source"; }
    @Override public String getLang() { return "en"; }
    @Override public boolean getSupportsLatest() { return false; }

    @Override public String getBaseUrl() {
        String origin = System.getProperty("yomikura.fixture.origin", "");
        if (!origin.matches("http://127\\.0\\.0\\.1:[0-9]+")) {
            throw new IllegalStateException("Migration source requires an isolated loopback origin");
        }
        return origin;
    }

    @Override public Observable<MangasPage> fetchPopularManga(int page) {
        SManga book = SManga.Companion.create();
        book.setUrl("/migration-story");
        book.setTitle("Migration Story");
        return Observable.just(new MangasPage(page == 1 ? List.of(book) : List.of(), false));
    }

    @Override public Observable<MangasPage> fetchSearchManga(int page, String query, FilterList filters) {
        return fetchPopularManga(page);
    }

    @Override public Observable<SManga> fetchMangaDetails(SManga book) {
        book.setDescription("Original synthetic story for upgrade verification.");
        return Observable.just(book);
    }

    @Override public Observable<List<SChapter>> fetchChapterList(SManga book) {
        SChapter saved = chapter("Chapter 1", 1);
        SChapter online = chapter("Chapter 2", 2);
        return Observable.just(List.of(online, saved));
    }

    private SChapter chapter(String name, int number) {
        SChapter chapter = SChapter.Companion.create();
        chapter.setUrl("/chapter-" + number);
        chapter.setName(name);
        chapter.setChapter_number(number);
        return chapter;
    }

    @Override public Observable<List<Page>> fetchPageList(SChapter chapter) {
        String origin = getBaseUrl();
        return Observable.just(List.of(
            new Page(0, "", origin + "/page/1.webp", null),
            new Page(1, "", origin + "/page/2.webp", null),
            new Page(2, "", origin + "/page/3.webp", null)
        ));
    }
}
