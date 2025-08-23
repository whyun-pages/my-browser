import { Toolbar } from "./components/toolbar";
import { TabsContainer } from "./components/tabs-container";
import { ContentArea } from "./components/content-area";
import { Bookmarks } from "./components/bookmarks";

const app = document.getElementById("app");

app?.append(<TabsContainer />);
app?.append(<Toolbar />);
app?.append(<ContentArea />);
app?.append(<Bookmarks />);

