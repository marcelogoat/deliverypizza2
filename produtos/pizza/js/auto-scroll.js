// Auto-scroll to next section when maximum selections are reached
$(document).ready(function () {
    $(document).on('click', '.adicionarQtdeOpcao', function () {
        const tipoSection = $(this).closest('.tipo');
        const maximo = parseInt(tipoSection.data('maximo'));

        // Count selections after a short delay to allow the click to complete
        setTimeout(() => {
            let selecionados = 0;
            tipoSection.find('.qtdeOpcao').each(function () {
                selecionados += parseInt($(this).val()) || 0;
            });

            // If maximum reached, scroll to next non-optional section
            if (selecionados >= maximo && maximo > 0) {
                let nextSection = tipoSection.nextAll('.tipo').not('[data-opcional="s"]').first();

                if (nextSection.length > 0) {
                    setTimeout(() => {
                        $('html, body').animate({
                            scrollTop: nextSection.offset().top - 100
                        }, 600);
                    }, 300);
                }
            }
        }, 100);
    });
});
