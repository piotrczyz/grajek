# Serwer powiadomień z minimalnymi, anonimowymi danymi

Grajek trzyma profil i historię ćwiczeń na telefonie, ale od pierwszej wersji ma pełne powiadomienia, których PWA nie wyśle bez serwera (zwłaszcza na iOS). Serwer zna wyłącznie anonimowy identyfikator urządzenia, porę przypomnienia i informację, czy danego dnia był zapis — żeby nie przypominać niepotrzebnie — i nigdy imienia ani innych danych identyfikujących.

**Considered Options:** w pełni lokalnie bez przypomnień (rekomendowane przez asystenta, odrzucone przez użytkownika); przypomnienie w kalendarzu telefonu; serwer znający tylko adres powiadomień i godzinę (bez danych o ćwiczeniach — powiadomienie przychodziłoby także po ćwiczeniu).

**Consequences:** projekt przestaje być czysto offline i potrzebuje hostingu. Zgodność z RODO dla danych dzieci poniżej 16 lat wymaga weryfikacji prawnej przed publikacją (patrz Open Questions w discovery-notes).
