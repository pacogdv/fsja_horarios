"""T1.5 — Configuración validada con Pydantic Settings, sin filtrar secretos."""

import pytest

from solver.settings import Settings, SettingsError

TOKEN = "s" * 32


class TestConfiguracionValida:
    def test_lee_el_token_y_aplica_el_valor_por_defecto_de_trabajos(self) -> None:
        settings = Settings.from_env({"SOLVER_SERVICE_TOKEN": TOKEN})
        assert settings.service_token.get_secret_value() == TOKEN
        assert settings.max_concurrent_jobs == 1

    def test_lee_los_trabajos_simultaneos(self) -> None:
        settings = Settings.from_env({"SOLVER_SERVICE_TOKEN": TOKEN, "SOLVER_MAX_CONCURRENT_JOBS": "3"})
        assert settings.max_concurrent_jobs == 3

    def test_una_opcional_vacia_toma_su_valor_por_defecto(self) -> None:
        settings = Settings.from_env({"SOLVER_SERVICE_TOKEN": TOKEN, "SOLVER_MAX_CONCURRENT_JOBS": ""})
        assert settings.max_concurrent_jobs == 1

    def test_ignora_variables_ajenas(self) -> None:
        settings = Settings.from_env({"SOLVER_SERVICE_TOKEN": TOKEN, "PATH": "/usr/bin"})
        assert settings.max_concurrent_jobs == 1

    def test_lee_el_entorno_del_proceso_por_defecto(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("SOLVER_SERVICE_TOKEN", TOKEN)
        assert Settings.from_env().service_token.get_secret_value() == TOKEN

    def test_el_token_no_aparece_en_repr_ni_en_str(self) -> None:
        settings = Settings.from_env({"SOLVER_SERVICE_TOKEN": TOKEN})
        assert TOKEN not in repr(settings)
        assert TOKEN not in str(settings)


class TestConfiguracionInvalida:
    def test_sin_token_el_error_nombra_la_variable(self) -> None:
        with pytest.raises(SettingsError) as error:
            Settings.from_env({})
        assert error.value.variables == ("SOLVER_SERVICE_TOKEN",)
        assert "SOLVER_SERVICE_TOKEN" in str(error.value)

    def test_un_token_vacio_cuenta_como_ausente(self) -> None:
        with pytest.raises(SettingsError) as error:
            Settings.from_env({"SOLVER_SERVICE_TOKEN": ""})
        assert error.value.variables == ("SOLVER_SERVICE_TOKEN",)

    def test_un_token_corto_falla_sin_mostrar_su_valor(self) -> None:
        leaked = "token-corto-secreto"
        with pytest.raises(SettingsError) as error:
            Settings.from_env({"SOLVER_SERVICE_TOKEN": leaked})
        assert error.value.variables == ("SOLVER_SERVICE_TOKEN",)
        assert "SOLVER_SERVICE_TOKEN: debe tener al menos 32 caracteres" in str(error.value)
        assert leaked not in str(error.value)
        assert leaked not in repr(error.value)
        assert error.value.__cause__ is None
        assert error.value.__suppress_context__

    @pytest.mark.parametrize("value", ["0", "-1", "abc", "1.5"])
    def test_trabajos_simultaneos_debe_ser_un_entero_positivo(self, value: str) -> None:
        with pytest.raises(SettingsError) as error:
            Settings.from_env({"SOLVER_SERVICE_TOKEN": TOKEN, "SOLVER_MAX_CONCURRENT_JOBS": value})
        assert error.value.variables == ("SOLVER_MAX_CONCURRENT_JOBS",)

    def test_informa_de_todas_las_variables_a_la_vez(self) -> None:
        with pytest.raises(SettingsError) as error:
            Settings.from_env({"SOLVER_MAX_CONCURRENT_JOBS": "0"})
        assert error.value.variables == ("SOLVER_MAX_CONCURRENT_JOBS", "SOLVER_SERVICE_TOKEN")


class TestFabrica:
    def test_create_app_sin_configuracion_valida_el_entorno(self, monkeypatch: pytest.MonkeyPatch) -> None:
        from solver.api.app import create_app

        monkeypatch.delenv("SOLVER_SERVICE_TOKEN", raising=False)
        with pytest.raises(SettingsError):
            create_app()
